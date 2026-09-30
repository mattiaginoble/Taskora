<?php

declare(strict_types=1);

require __DIR__ . '/database.php';

startSecureSession();
sendApiHeaders();

$pdo = getPdo();
$method = $_SERVER['REQUEST_METHOD'];

// Limiti ai tentativi falliti nell'arco di LOGIN_WINDOW_MINUTES.
const LOGIN_WINDOW_MINUTES = 15;
const MAX_FAILURES_PER_USER = 5;
const MAX_FAILURES_PER_IP = 20;

function sessionUserPayload(array $user): array
{
    return [
        'id' => (int) $user['id'],
        'username' => $user['username'],
        'role' => $user['role'] ?? 'user',
    ];
}

function countRecentFailures(PDO $pdo, string $column, string $value): int
{
    $stmt = $pdo->prepare(
        "SELECT COUNT(*) FROM login_attempts WHERE {$column} = :value AND attempted_at > :since"
    );
    $stmt->execute([
        ':value' => $value,
        ':since' => date('Y-m-d H:i:s', time() - LOGIN_WINDOW_MINUTES * 60),
    ]);

    return (int) $stmt->fetchColumn();
}

function updatePasswordHash(PDO $pdo, int $userId, string $password): void
{
    $pdo->prepare('UPDATE users SET password_hash = :hash, must_change_password = 0 WHERE id = :id')->execute([
        ':hash' => password_hash($password, PASSWORD_DEFAULT),
        ':id' => $userId,
    ]);
}

if ($method === 'GET') {
    if (!isset($_SESSION['user'])) {
        jsonResponse(['success' => false, 'error' => 'Non autenticato'], 401);
    }

    if (isset($_GET['mode']) && $_GET['mode'] === 'users') {
        $users = fetchAdministrators($pdo);
        jsonResponse(['success' => true, 'users' => $users]);
    }

    // Nome visualizzato letto ogni volta, così una modifica dell'admin si vede subito.
    $people = fetchPeople($pdo);
    $user = sessionUserPayload($_SESSION['user']);
    $user['display_name'] = $people[$user['username']] ?? $user['username'];

    jsonResponse([
        'success' => true,
        'user' => $user,
        'must_change_password' => !empty($_SESSION['must_change_password']),
    ]);
}

if ($method === 'POST') {
    $input = readJsonInput();
    $username = isset($input['username']) ? trim((string) $input['username']) : '';
    $password = isset($input['password']) ? (string) $input['password'] : '';
    $ip = (string) ($_SERVER['REMOTE_ADDR'] ?? '');

    if ($username === '' || $password === '') {
        jsonResponse(['success' => false, 'error' => 'Nome utente e password obbligatori'], 422);
    }

    if (countRecentFailures($pdo, 'username', $username) >= MAX_FAILURES_PER_USER
        || countRecentFailures($pdo, 'ip', $ip) >= MAX_FAILURES_PER_IP) {
        jsonResponse([
            'success' => false,
            'error' => 'Troppi tentativi falliti. Riprova tra ' . LOGIN_WINDOW_MINUTES . ' minuti.',
        ], 429);
    }

    $stmt = $pdo->prepare('SELECT id, username, password_hash, role, must_change_password FROM users WHERE username = :username LIMIT 1');
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch();

    // Verifica anche per utenti inesistenti, per non rivelare quali esistono dai tempi di risposta.
    $hash = $user ? (string) $user['password_hash'] : password_hash('fittizia', PASSWORD_DEFAULT);
    if (!$user || !verifyPassword($password, $hash)) {
        $pdo->prepare('INSERT INTO login_attempts (username, ip, attempted_at) VALUES (:username, :ip, :at)')
            ->execute([':username' => $username, ':ip' => $ip, ':at' => date('Y-m-d H:i:s')]);
        $pdo->exec("DELETE FROM login_attempts WHERE attempted_at < '" . date('Y-m-d H:i:s', time() - 86400) . "'");
        jsonResponse(['success' => false, 'error' => 'Credenziali non valide'], 401);
    }

    // Password da cambiare: assegnata dall'admin, debole o troppo corta.
    $mustChange = (bool) $user['must_change_password']
        || in_array(strtolower($password), WEAK_PASSWORDS, true)
        || strlen($password) < MIN_PASSWORD_LENGTH;

    // Converte i vecchi hash MD5 al primo accesso riuscito.
    if (isLegacyPasswordHash($hash) || password_needs_rehash($hash, PASSWORD_DEFAULT)) {
        $pdo->prepare('UPDATE users SET password_hash = :hash WHERE id = :id')->execute([
            ':hash' => password_hash($password, PASSWORD_DEFAULT),
            ':id' => (int) $user['id'],
        ]);
    }
    $pdo->prepare('DELETE FROM login_attempts WHERE username = :username')->execute([':username' => $username]);

    session_regenerate_id(true);
    $_SESSION['user'] = sessionUserPayload($user);
    $_SESSION['must_change_password'] = $mustChange;

    jsonResponse([
        'success' => true,
        'user' => $_SESSION['user'],
        'must_change_password' => $_SESSION['must_change_password'],
    ]);
}

if ($method === 'PUT') {
    $input = readJsonInput();

    // Ognuno può cambiare il proprio nome visualizzato.
    if (array_key_exists('display_name', $input) && !array_key_exists('new_password', $input)) {
        $sessionUser = requireAuthenticatedUser();
        $displayName = normalizeDisplayName($input['display_name']);
        $pdo->prepare('UPDATE users SET display_name = :display_name WHERE id = :id')->execute([
            ':display_name' => $displayName,
            ':id' => (int) $sessionUser['id'],
        ]);
        jsonResponse(['success' => true, 'display_name' => $displayName ?? $sessionUser['username']]);
    }

    $sessionUser = requireAuthenticatedUser(true);
    $currentPassword = (string) ($input['current_password'] ?? '');
    $newPassword = (string) ($input['new_password'] ?? '');

    validateNewPassword($newPassword);
    if ($newPassword === $currentPassword) {
        jsonResponse(['success' => false, 'error' => 'La nuova password deve essere diversa da quella attuale'], 422);
    }

    $stmt = $pdo->prepare('SELECT id, password_hash FROM users WHERE id = :id LIMIT 1');
    $stmt->execute([':id' => (int) $sessionUser['id']]);
    $user = $stmt->fetch();
    if (!$user || !verifyPassword($currentPassword, (string) $user['password_hash'])) {
        jsonResponse(['success' => false, 'error' => 'La password attuale non è corretta'], 422);
    }

    updatePasswordHash($pdo, (int) $user['id'], $newPassword);
    session_regenerate_id(true);
    $_SESSION['must_change_password'] = false;

    jsonResponse(['success' => true]);
}

if ($method === 'DELETE') {
    $_SESSION = [];
    $params = session_get_cookie_params();
    setcookie(session_name(), '', [
        'expires' => time() - 3600,
        'path' => $params['path'],
        'secure' => $params['secure'],
        'httponly' => $params['httponly'],
        'samesite' => $params['samesite'],
    ]);
    session_destroy();
    jsonResponse(['success' => true]);
}

jsonResponse(['success' => false, 'error' => 'Metodo non consentito'], 405);
