<?php

declare(strict_types=1);

require __DIR__ . '/database.php';

startSecureSession();
sendApiHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'error' => 'Metodo non consentito'], 405);
}

$sessionUser = requireAuthenticatedUser();
$pdo = getPdo();
$currentUser = $sessionUser['username'] ?? '';
$isAdmin = isAdministrator($sessionUser);

// Solo gli amministratori possono essere responsabili di un'attività.
$users = fetchAdministrators($pdo);
$projects = $pdo->query('SELECT id, nome FROM projects ORDER BY nome ASC')->fetchAll();

$settoreFilter = isset($_GET['settore']) ? trim((string) $_GET['settore']) : '';
$tasks = fetchTasks($pdo, $isAdmin, $currentUser, $settoreFilter);

jsonResponse([
    'success' => true,
    'user' => [
        'id' => (int) $sessionUser['id'],
        'username' => $sessionUser['username'],
        'role' => $sessionUser['role'] ?? 'user',
    ],
    'users' => $users,
    'projects' => $projects,
    'sectors' => fetchSectors($pdo),
    'people' => fetchPeople($pdo),
    'tasks' => $tasks,
]);
