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
];
