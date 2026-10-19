<?php

/**
 * Copia questo file in config.local.php (escluso da git) e inserisci le
 * credenziali reali. In alternativa usa le variabili d'ambiente indicate
 * in config.php.
 */
return [
    'host' => 'localhost',
    'dbname' => 'todolist',
    'username' => 'utente_db',
    'password' => 'password_db',
    // Solo per un'installazione nuova (tabella utenti vuota).
    'admin_initial_password' => '',

    // Configurazione email per le notifiche (facoltativa)
    // 'mail_driver' => 'smtp', // 'smtp' oppure 'mail'
    // 'mail_host' => 'smtp.azienda.it',
    // 'mail_port' => 587,
    // 'mail_username' => 'notifiche@azienda.it',
    // 'mail_password' => 'segreta',
    // 'mail_encryption' => 'tls', // 'tls', 'ssl' o vuoto
    // 'mail_from_address' => 'notifiche@azienda.it',
    // 'mail_from_name' => 'Taskora',
    // 'app_url' => 'https://taskora.azienda.it',
];

