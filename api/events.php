<?php

declare(strict_types=1);

require __DIR__ . '/database.php';

startSecureSession();
sendApiHeaders();

if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    jsonResponse(['success' => false, 'error' => 'Metodo non consentito'], 405);
}

$sessionUser = requireAuthenticatedUser();
if (!isAdministrator($sessionUser)) {
    jsonResponse(['success' => false, 'error' => 'Registro riservato agli amministratori'], 403);
}

$pdo = getPdo();

// Registro eventi di una o più attività: ?task_id=id1,id2
$taskIds = array_values(array_unique(array_filter(array_map(
    'trim',
    explode(',', (string) ($_GET['task_id'] ?? ''))
))));
if (!$taskIds) {
    jsonResponse(['success' => false, 'error' => 'Parametro task_id obbligatorio'], 422);
}
if (count($taskIds) > 200) {
    jsonResponse(['success' => false, 'error' => 'Troppe attività richieste'], 422);
}

$placeholders = implode(',', array_fill(0, count($taskIds), '?'));
$stmt = $pdo->prepare(
    "SELECT id, task_id, username, event_type, field, old_value, new_value, created_at
     FROM task_events WHERE task_id IN ({$placeholders}) ORDER BY created_at DESC, id DESC"
);
$stmt->execute($taskIds);

jsonResponse(['success' => true, 'events' => $stmt->fetchAll()]);
