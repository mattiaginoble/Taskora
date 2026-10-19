<?php

declare(strict_types=1);

require __DIR__ . '/database.php';

startSecureSession();
sendApiHeaders();

$sessionUser = requireAuthenticatedUser();
if (!isAdministrator($sessionUser)) {
    jsonResponse(['success' => false, 'error' => 'Funzione riservata agli amministratori'], 403);
}

$pdo = getPdo();
$method = $_SERVER['REQUEST_METHOD'];

const ROLES = ['user', 'administrator'];

function findUser(PDO $pdo, string $username): array
{
    $stmt = $pdo->prepare('SELECT id, username, role FROM users WHERE username = :username LIMIT 1');
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch();
    if (!$user) {
        jsonResponse(['success' => false, 'error' => 'Utente non trovato'], 404);
    }

    return $user;
}

if ($method === 'GET') {
    $users = $pdo->query(
        'SELECT id, username, email, display_name, role, must_change_password, created_at FROM users ORDER BY username ASC'
    )->fetchAll();
    $projects = $pdo->query(
        'SELECT p.id, p.nome, p.created_at, COUNT(t.id) AS attivita
         FROM projects p LEFT JOIN tasks t ON LOWER(t.progetto) = LOWER(p.nome) AND t.deleted_at IS NULL
         GROUP BY p.id, p.nome, p.created_at ORDER BY p.nome ASC'
    )->fetchAll();

    $sectors = $pdo->query(
        'SELECT s.id, s.nome, s.created_at, COUNT(t.id) AS attivita
         FROM sectors s LEFT JOIN tasks t ON LOWER(t.settore) = LOWER(s.nome) AND t.deleted_at IS NULL
         GROUP BY s.id, s.nome, s.created_at ORDER BY s.id ASC'
    )->fetchAll();

    jsonResponse(['success' => true, 'users' => $users, 'projects' => $projects, 'sectors' => $sectors]);
}

if ($method === 'POST') {
    $input = readJsonInput();
    $action = (string) ($input['action'] ?? '');

    if ($action === 'create_user') {
        $username = trim((string) ($input['username'] ?? ''));
        $email = trim((string) ($input['email'] ?? ''));
        $role = (string) ($input['role'] ?? 'user');
        $password = (string) ($input['password'] ?? '');
        $displayName = normalizeDisplayName($input['display_name'] ?? '');

        if (!preg_match('/^[A-Za-z0-9._-]{3,50}$/', $username)) {
            jsonResponse(['success' => false, 'error' => 'Nome utente: 3-50 caratteri tra lettere, numeri, punto, trattino e underscore'], 422);
        }
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['success' => false, 'error' => 'Indirizzo email non valido'], 422);
        }
        if (!in_array($role, ROLES, true)) {
            jsonResponse(['success' => false, 'error' => 'Ruolo non valido'], 422);
        }
        validateNewPassword($password);

        $exists = $pdo->prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(:username) LIMIT 1');
        $exists->execute([':username' => $username]);
        if ($exists->fetch()) {
            jsonResponse(['success' => false, 'error' => 'Esiste già un utente con questo nome'], 422);
        }

        if ($email !== '') {
            $existsEmail = $pdo->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(:email) LIMIT 1');
            $existsEmail->execute([':email' => $email]);
            if ($existsEmail->fetch()) {
                jsonResponse(['success' => false, 'error' => 'Esiste già un utente con questo indirizzo email'], 422);
            }
        }

        // La password scelta dall'admin va cambiata al primo accesso.
        $pdo->prepare(
            'INSERT INTO users (username, email, display_name, password_hash, role, must_change_password, created_at)
             VALUES (:username, :email, :display_name, :hash, :role, 1, :created_at)'
        )->execute([
            ':username' => $username,
            ':email' => $email !== '' ? $email : null,
            ':display_name' => $displayName,
            ':hash' => password_hash($password, PASSWORD_DEFAULT),
            ':role' => $role,
            ':created_at' => date('Y-m-d H:i:s'),
        ]);

        jsonResponse(['success' => true]);
    }

    if ($action === 'reset_password') {
        $user = findUser($pdo, trim((string) ($input['username'] ?? '')));
        $password = (string) ($input['password'] ?? '');
        validateNewPassword($password);

        $pdo->prepare('UPDATE users SET password_hash = :hash, must_change_password = 1 WHERE id = :id')->execute([
            ':hash' => password_hash($password, PASSWORD_DEFAULT),
            ':id' => (int) $user['id'],
        ]);
        // Sblocca l'utente se era stato bloccato dai tentativi falliti.
        $pdo->prepare('DELETE FROM login_attempts WHERE username = :username')->execute([':username' => $user['username']]);

        jsonResponse(['success' => true]);
    }

    if ($action === 'set_display_name') {
        $user = findUser($pdo, trim((string) ($input['username'] ?? '')));
        $pdo->prepare('UPDATE users SET display_name = :display_name WHERE id = :id')->execute([
            ':display_name' => normalizeDisplayName($input['display_name'] ?? ''),
            ':id' => (int) $user['id'],
        ]);
        jsonResponse(['success' => true]);
    }

    if ($action === 'set_email') {
        $user = findUser($pdo, trim((string) ($input['username'] ?? '')));
        $email = trim((string) ($input['email'] ?? ''));
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['success' => false, 'error' => 'Indirizzo email non valido'], 422);
        }
        if ($email !== '') {
            $existsEmail = $pdo->prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(:email) AND id <> :id LIMIT 1');
            $existsEmail->execute([':email' => $email, ':id' => (int) $user['id']]);
            if ($existsEmail->fetch()) {
                jsonResponse(['success' => false, 'error' => 'Esiste già un utente con questo indirizzo email'], 422);
            }
        }

        $pdo->prepare('UPDATE users SET email = :email WHERE id = :id')->execute([
            ':email' => $email !== '' ? $email : null,
            ':id' => (int) $user['id'],
        ]);
        jsonResponse(['success' => true]);
    }


    if ($action === 'set_role') {
        $user = findUser($pdo, trim((string) ($input['username'] ?? '')));
        $role = (string) ($input['role'] ?? '');
        if (!in_array($role, ROLES, true)) {
            jsonResponse(['success' => false, 'error' => 'Ruolo non valido'], 422);
        }
        if ((int) $user['id'] === (int) $sessionUser['id']) {
            jsonResponse(['success' => false, 'error' => 'Non puoi cambiare il tuo stesso ruolo'], 422);
        }

        $pdo->prepare('UPDATE users SET role = :role WHERE id = :id')->execute([':role' => $role, ':id' => (int) $user['id']]);
        jsonResponse(['success' => true]);
    }

    if ($action === 'create_project') {
        $name = trim((string) ($input['nome'] ?? ''));
        if ($name === '' || mb_strlen($name) > 100) {
            jsonResponse(['success' => false, 'error' => 'Il nome del progetto deve avere da 1 a 100 caratteri'], 422);
        }

        $exists = $pdo->prepare('SELECT id FROM projects WHERE LOWER(nome) = LOWER(:nome) LIMIT 1');
        $exists->execute([':nome' => $name]);
        if ($exists->fetch()) {
            jsonResponse(['success' => false, 'error' => 'Esiste già un progetto con questo nome'], 422);
        }

        $pdo->prepare('INSERT INTO projects (nome, created_at) VALUES (:nome, :created_at)')
            ->execute([':nome' => $name, ':created_at' => date('Y-m-d H:i:s')]);
        jsonResponse(['success' => true]);
    }

    if ($action === 'create_sector') {
        $name = trim((string) ($input['nome'] ?? ''));
        if ($name === '' || mb_strlen($name) > 50) {
            jsonResponse(['success' => false, 'error' => 'Il nome del settore deve avere da 1 a 50 caratteri'], 422);
        }

        $exists = $pdo->prepare('SELECT id FROM sectors WHERE LOWER(nome) = LOWER(:nome) LIMIT 1');
        $exists->execute([':nome' => $name]);
        if ($exists->fetch()) {
            jsonResponse(['success' => false, 'error' => 'Esiste già un settore con questo nome'], 422);
        }

        $pdo->prepare('INSERT INTO sectors (nome, created_at) VALUES (:nome, :created_at)')
            ->execute([':nome' => $name, ':created_at' => date('Y-m-d H:i:s')]);
        jsonResponse(['success' => true]);
    }

    jsonResponse(['success' => false, 'error' => 'Azione non valida'], 422);
}

jsonResponse(['success' => false, 'error' => 'Metodo non consentito'], 405);
