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
];
