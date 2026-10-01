<?php

declare(strict_types=1);

date_default_timezone_set('Europe/Rome');

// Versione dello schema: aumentarla quando si aggiunge una migrazione in
// bootstrapDatabase(), così viene eseguita una sola volta.
const SCHEMA_VERSION = 9;

const TASK_STATUSES = ['Da fare', 'In corso', 'Completato', 'Bloccato'];
const TASK_PRIORITIES = ['Bassa', 'Media', 'Alta'];
// Settori creati alla prima installazione; gli admin ne aggiungono altri dal web.
const DEFAULT_SECTORS = ['IT', 'Commerciale', 'Logistica', 'Scansioni'];
const TASK_COLUMNS = 'id, utente, creato_da, progetto, descrizione, scadenza, assegnato_a, priorita, settore, note, stato, avanzamento, ore_lavorate, created_at, started_at, completed_at, updated_at';

function getAppConfig(): array
{
    static $config = null;
    if ($config === null) {
        $config = require __DIR__ . '/../config.php';
    }

    return $config;
}

function getPdo(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $config = getAppConfig();
    if (empty($config['host']) || empty($config['username']) || $config['password'] === null) {
        error_log('Jobtrack: configurazione database mancante (vedi config.php)');
        jsonResponse(['success' => false, 'error' => 'Configurazione del server incompleta'], 500);
    }

    $markerFile = __DIR__ . '/../storage/.schema_v' . SCHEMA_VERSION;
    if (!is_file($markerFile)) {
        bootstrapDatabase($config, $markerFile);
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        $config['host'],
        $config['dbname'],
        $config['charset']
    );

    $pdo = new PDO($dsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => false,
    ]);

    return $pdo;
}

function bootstrapDatabase(array $config, string $markerFile): void
{
    $storageDir = dirname($markerFile);
    if (!is_dir($storageDir)) {
        mkdir($storageDir, 0755, true);
    }

    $adminDsn = sprintf('mysql:host=%s;charset=%s', $config['host'], $config['charset']);
    $adminPdo = new PDO($adminDsn, $config['username'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    ]);

    $adminPdo->exec(
        "CREATE DATABASE IF NOT EXISTS `{$config['dbname']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
    );

    $pdo = new PDO(
        sprintf(
            'mysql:host=%s;dbname=%s;charset=%s',
            $config['host'],
            $config['dbname'],
            $config['charset']
        ),
        $config['username'],
        $config['password'],
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        ]
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            role VARCHAR(50) NOT NULL DEFAULT 'user',
            created_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS tasks (
            id VARCHAR(100) PRIMARY KEY,
            utente VARCHAR(100) NOT NULL,
            progetto VARCHAR(100) NOT NULL,
            descrizione TEXT NOT NULL,
            scadenza DATE NOT NULL,
            assegnato_a VARCHAR(100) NULL,
            priorita VARCHAR(50) NOT NULL DEFAULT 'Media',
            settore VARCHAR(50) NULL,
            note TEXT NULL,
            stato VARCHAR(50) NOT NULL,
            avanzamento INT NOT NULL DEFAULT 0,
            created_at DATETIME NOT NULL,
            INDEX idx_tasks_assegnato_a (assegnato_a),
            INDEX idx_tasks_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS projects (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(100) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    // Registro eventi in sola aggiunta: l'applicazione non modifica né
    // cancella mai queste righe.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS task_events (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            task_id VARCHAR(100) NOT NULL,
            username VARCHAR(100) NOT NULL,
            event_type VARCHAR(30) NOT NULL,
            field VARCHAR(50) NULL,
            old_value TEXT NULL,
            new_value TEXT NULL,
            created_at DATETIME NOT NULL,
            INDEX idx_events_task (task_id, created_at),
            INDEX idx_events_user (username, created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS sectors (
            id INT AUTO_INCREMENT PRIMARY KEY,
            nome VARCHAR(50) NOT NULL UNIQUE,
            created_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    // Tentativi di accesso falliti, per limitare gli attacchi a forza bruta.
    $pdo->exec(
        "CREATE TABLE IF NOT EXISTS login_attempts (
            id BIGINT AUTO_INCREMENT PRIMARY KEY,
            username VARCHAR(100) NOT NULL,
            ip VARCHAR(45) NOT NULL,
            attempted_at DATETIME NOT NULL,
            INDEX idx_attempts_username (username, attempted_at),
            INDEX idx_attempts_ip (ip, attempted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
    );

    $columns = [
        ['users', 'role', "VARCHAR(50) NOT NULL DEFAULT 'user'"],
        ['users', 'must_change_password', 'TINYINT(1) NOT NULL DEFAULT 0'],
        ['users', 'display_name', 'VARCHAR(100) NULL'],
        ['tasks', 'assegnato_a', 'VARCHAR(100) NULL'],
        ['tasks', 'priorita', "VARCHAR(50) NOT NULL DEFAULT 'Media'"],
        ['tasks', 'settore', 'VARCHAR(50) NULL'],
        ['tasks', 'avanzamento', 'INT NOT NULL DEFAULT 0'],
        ['tasks', 'ore_lavorate', 'DECIMAL(8,2) NOT NULL DEFAULT 0'],
        ['tasks', 'started_at', 'DATETIME NULL'],
        ['tasks', 'completed_at', 'DATETIME NULL'],
        ['tasks', 'updated_at', 'DATETIME NULL'],
        ['tasks', 'deleted_at', 'DATETIME NULL'],
        ['tasks', 'deleted_by', 'VARCHAR(100) NULL'],
        // Chi ha creato e assegnato l'attività ("Assegnato da"). La vecchia colonna
        // assegnato_a (il "responsabile" scelto a mano) resta nel database ma non si usa più.
        ['tasks', 'creato_da', 'VARCHAR(100) NULL'],
    ];
    foreach ($columns as [$table, $column, $definition]) {
        if (!hasColumn($pdo, $table, $column)) {
            $pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$column}` {$definition}");
        }
    }

    ensureIndex($pdo, 'tasks', 'idx_tasks_assegnato_a', 'assegnato_a');
    ensureIndex($pdo, 'tasks', 'idx_tasks_created_at', 'created_at');
    ensureIndex($pdo, 'tasks', 'idx_tasks_utente', 'utente');
    backfillTaskCreators($pdo);

    // Primo amministratore solo su installazione nuova e con password configurata.
    $userCount = (int) $pdo->query('SELECT COUNT(*) FROM users')->fetchColumn();
    $initialPassword = (string) ($config['admin_initial_password'] ?? '');
    if ($userCount === 0 && $initialPassword !== '') {
        $defaultPasswordHash = password_hash($initialPassword, PASSWORD_DEFAULT);
        $pdo->prepare(
            'INSERT INTO users (username, password_hash, role, created_at) VALUES (:username, :password_hash, :role, :created_at)'
        )->execute([
            ':username' => 'admin',
            ':password_hash' => $defaultPasswordHash,
            ':role' => 'administrator',
            ':created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    // Settori predefiniti più quelli già usati nelle attività esistenti.
    $sectorCount = (int) $pdo->query('SELECT COUNT(*) FROM sectors')->fetchColumn();
    if ($sectorCount === 0) {
        $existing = $pdo->query("SELECT DISTINCT settore FROM tasks WHERE settore IS NOT NULL AND settore <> ''")->fetchAll(PDO::FETCH_COLUMN);
        $insertSector = $pdo->prepare('INSERT IGNORE INTO sectors (nome, created_at) VALUES (:nome, :created_at)');
        foreach (array_merge(DEFAULT_SECTORS, $existing) as $sector) {
            $insertSector->execute([':nome' => trim((string) $sector), ':created_at' => date('Y-m-d H:i:s')]);
        }
    }

    $projectCount = (int) $pdo->query('SELECT COUNT(*) FROM projects')->fetchColumn();
    if ($projectCount === 0) {
        $pdo->prepare('INSERT INTO projects (nome, created_at) VALUES (:nome, :created_at)')->execute([
            ':nome' => 'Generale',
            ':created_at' => date('Y-m-d H:i:s'),
        ]);
    }

    file_put_contents($markerFile, date('c'));
}

// Autore delle attività create prima della colonna creato_da: l'evento "created"
// del registro oppure, per quelle ancora più vecchie, chi ha scritto la prima task.
function backfillTaskCreators(PDO $pdo): void
{
    $pdo->exec(
        "UPDATE tasks t SET t.creato_da = (
            SELECT e.username FROM task_events e
            WHERE e.task_id = t.id AND e.event_type = 'created'
            ORDER BY e.id ASC LIMIT 1
        ) WHERE t.creato_da IS NULL"
    );

    $update = $pdo->prepare('UPDATE tasks SET creato_da = :creato_da WHERE id = :id');
    foreach ($pdo->query('SELECT id, utente, note FROM tasks WHERE creato_da IS NULL')->fetchAll() as $task) {
        $author = preg_match('/^\[[^\]]+\]\s*([^:\n]+):/m', (string) $task['note'], $match)
            ? trim($match[1])
            : (string) $task['utente'];
        $update->execute([':creato_da' => $author, ':id' => $task['id']]);
    }
}

function hasColumn(PDO $pdo, string $table, string $column): bool
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = DATABASE() AND table_name = :table AND column_name = :column'
    );
    $stmt->execute([':table' => $table, ':column' => $column]);

    return (int) $stmt->fetchColumn() > 0;
}

function ensureIndex(PDO $pdo, string $table, string $indexName, string $column): void
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM information_schema.statistics
         WHERE table_schema = DATABASE() AND table_name = :table AND index_name = :index_name'
    );
    $stmt->execute([
        ':table' => $table,
        ':index_name' => $indexName,
    ]);

    if ((int) $stmt->fetchColumn() === 0) {
        $pdo->exec("CREATE INDEX `{$indexName}` ON `{$table}` (`{$column}`)");
    }
}

// Attività visibili all'utente: tutte per gli admin, solo le proprie per gli altri.
function fetchTasks(PDO $pdo, bool $isAdmin, string $currentUser, string $settore = ''): array
{
    $conditions = ['deleted_at IS NULL'];
    $params = [];

    if ($settore !== '') {
        $conditions[] = 'settore = :settore';
        $params[':settore'] = $settore;
    }

    if (!$isAdmin) {
        $conditions[] = 'utente = :utente';
        $params[':utente'] = $currentUser;
    }

    $stmt = $pdo->prepare(
        'SELECT ' . TASK_COLUMNS . ' FROM tasks WHERE ' . implode(' AND ', $conditions) . ' ORDER BY created_at DESC'
    );
    $stmt->execute($params);

    return array_map('normalizeTaskRow', $stmt->fetchAll());
}

function fetchTaskById(PDO $pdo, string $id, bool $forUpdate = false): ?array
{
    $stmt = $pdo->prepare(
        'SELECT ' . TASK_COLUMNS . ' FROM tasks WHERE id = :id AND deleted_at IS NULL LIMIT 1'
        . ($forUpdate ? ' FOR UPDATE' : '')
    );
    $stmt->execute([':id' => $id]);
    $task = $stmt->fetch();

    return $task ? normalizeTaskRow($task) : null;
}

// Nome visualizzato: facoltativo, al massimo 100 caratteri; vuoto = si usa lo username.
function normalizeDisplayName($value): ?string
{
    $name = trim(preg_replace('/\s+/u', ' ', (string) $value) ?? '');
    if (mb_strlen($name) > 100) {
        jsonResponse(['success' => false, 'error' => 'Il nome visualizzato può avere al massimo 100 caratteri'], 422);
    }

    return $name === '' ? null : $name;
}

// Nome da mostrare per ogni utente: il nome visualizzato se impostato, altrimenti lo username.
function fetchPeople(PDO $pdo): array
{
    $people = [];
    foreach ($pdo->query('SELECT username, display_name FROM users')->fetchAll() as $row) {
        $name = trim((string) ($row['display_name'] ?? ''));
        $people[$row['username']] = $name !== '' ? $name : $row['username'];
    }

    return $people;
}

// Amministratori selezionabili come responsabili.
function fetchAdministrators(PDO $pdo): array
{
    $admins = $pdo->query(
        "SELECT id, username, display_name FROM users WHERE LOWER(role) IN ('administrator', 'admin') ORDER BY COALESCE(NULLIF(display_name, ''), username) ASC"
    )->fetchAll();

    return array_map(static function (array $admin): array {
        $name = trim((string) ($admin['display_name'] ?? ''));
        $admin['display_name'] = $name !== '' ? $name : $admin['username'];

        return $admin;
    }, $admins);
}

function fetchSectors(PDO $pdo): array
{
    return $pdo->query('SELECT nome FROM sectors ORDER BY id ASC')->fetchAll(PDO::FETCH_COLUMN);
}

function normalizeTaskRow(array $task): array
{
    $task['avanzamento'] = (int) ($task['avanzamento'] ?? 0);
    $task['ore_lavorate'] = (float) ($task['ore_lavorate'] ?? 0);

    return $task;
}

function logTaskEvent(
    PDO $pdo,
    string $taskId,
    string $username,
    string $eventType,
    ?string $field = null,
    ?string $oldValue = null,
    ?string $newValue = null
): void {
    $pdo->prepare(
        'INSERT INTO task_events (task_id, username, event_type, field, old_value, new_value, created_at)
         VALUES (:task_id, :username, :event_type, :field, :old_value, :new_value, :created_at)'
    )->execute([
        ':task_id' => $taskId,
        ':username' => $username,
        ':event_type' => $eventType,
        ':field' => $field,
        ':old_value' => $oldValue,
        ':new_value' => $newValue,
        ':created_at' => date('Y-m-d H:i:s'),
    ]);
}

function isAdministrator(array $user): bool
{
    $role = strtolower((string) ($user['role'] ?? 'user'));

    return in_array($role, ['administrator', 'admin'], true);
}

function jsonResponse(array $payload, int $status = 200): void
{
    http_response_code($status);
    echo json_encode($payload);
    exit;
}

// Solo JSON: un form di un altro sito non può inviare application/json senza
// preflight CORS, quindi questo blocca le richieste falsificate (CSRF).
function readJsonInput(): array
{
    if (stripos((string) ($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json') === false) {
        jsonResponse(['success' => false, 'error' => 'Richiesta non valida: atteso JSON'], 415);
    }

    $data = json_decode(file_get_contents('php://input') ?: '', true);

    return is_array($data) ? $data : [];
}

// L'API è usata solo dalle pagine dello stesso sito: nessun header CORS.
function sendApiHeaders(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: no-store');
}

function startSecureSession(): void
{
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_set_cookie_params([
        'lifetime' => 0,
        'path' => '/',
        'secure' => $isHttps,
        'httponly' => true,
        'samesite' => 'Lax',
    ]);
    ini_set('session.use_strict_mode', '1');
    session_start();
}

function isLegacyPasswordHash(string $hash): bool
{
    return (bool) preg_match('/^[a-f0-9]{32}$/i', $hash);
}

const MIN_PASSWORD_LENGTH = 8;
// Password note che non vengono accettate e obbligano al cambio.
const WEAK_PASSWORDS = ['admin123', 'password', '12345678'];

function validateNewPassword(string $password): void
{
    if (strlen($password) < MIN_PASSWORD_LENGTH) {
        jsonResponse(['success' => false, 'error' => 'La password deve avere almeno ' . MIN_PASSWORD_LENGTH . ' caratteri'], 422);
    }
    if (in_array(strtolower($password), WEAK_PASSWORDS, true)) {
        jsonResponse(['success' => false, 'error' => 'Scegli una password meno prevedibile'], 422);
    }
}

// Verifica sia gli hash moderni sia i vecchi MD5 (convertiti al primo login).
function verifyPassword(string $password, string $hash): bool
{
    if (isLegacyPasswordHash($hash)) {
        return hash_equals(strtolower($hash), md5($password));
    }

    return password_verify($password, $hash);
}

function requireAuthenticatedUser(bool $allowPendingPasswordChange = false): array
{
    if (!isset($_SESSION['user'])) {
        jsonResponse(['success' => false, 'error' => 'Autenticazione richiesta'], 401);
    }

    // Chi è entrato con una password debole deve prima cambiarla.
    if (!$allowPendingPasswordChange && !empty($_SESSION['must_change_password'])) {
        jsonResponse(['success' => false, 'error' => 'Devi cambiare la password prima di continuare'], 403);
    }

    return $_SESSION['user'];
}
