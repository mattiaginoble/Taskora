<?php

/**
 * Configurazione database.
 *
 * Le credenziali NON vanno nel repository. Impostale nelle variabili
 * d'ambiente DB_HOST, DB_NAME, DB_USERNAME, DB_PASSWORD oppure in
 * config.local.php (escluso da git: copia config.local.example.php).
 * Le variabili d'ambiente hanno la precedenza.
 */
$local = is_file(__DIR__ . '/config.local.php') ? require __DIR__ . '/config.local.php' : [];

$value = static function (string $env, string $key, ?string $default = null) use ($local): ?string {
    $fromEnv = getenv($env);
    if ($fromEnv !== false && $fromEnv !== '') {
        return $fromEnv;
    }

    return isset($local[$key]) ? (string) $local[$key] : $default;
};

return [
    'host' => $value('DB_HOST', 'host'),
    'dbname' => $value('DB_NAME', 'dbname', 'todolist'),
    'username' => $value('DB_USERNAME', 'username'),
    'password' => $value('DB_PASSWORD', 'password'),
    'charset' => 'utf8mb4',
    // Password del primo utente "admin", usata solo se la tabella utenti è vuota.
    'admin_initial_password' => $value('ADMIN_INITIAL_PASSWORD', 'admin_initial_password'),

    // Notifiche email per l'assegnazione delle task
    'mail' => [
        // 'mail' (funzione nativa PHP) oppure 'smtp'
        'driver' => $value('MAIL_DRIVER', 'mail_driver', 'mail'),
        'host' => $value('MAIL_HOST', 'mail_host', 'localhost'),
        'port' => (int) ($value('MAIL_PORT', 'mail_port', '25')),
        'username' => $value('MAIL_USERNAME', 'mail_username', ''),
        'password' => $value('MAIL_PASSWORD', 'mail_password', ''),
        // '', 'tls' (STARTTLS, ad es. porta 587) o 'ssl' (SMTPS, ad es. porta 465)
        'encryption' => $value('MAIL_ENCRYPTION', 'mail_encryption', ''),
        'from_address' => $value('MAIL_FROM_ADDRESS', 'mail_from_address', 'noreply@taskora.local'),
        'from_name' => $value('MAIL_FROM_NAME', 'mail_from_name', 'Taskora'),
    ],
    // URL base dell'applicazione per i link nelle email (es. 'https://taskora.azienda.it')
    'app_url' => $value('APP_URL', 'app_url', ''),
];

