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
$currentUser = (string) ($sessionUser['username'] ?? '');
$isAdmin = isAdministrator($sessionUser);

// Ore registrate per giorno, persona e settore della task (pagina Statistiche).
// Gli admin vedono tutti, i dipendenti solo le proprie ore.
$days = max(7, min(400, (int) ($_GET['days'] ?? 365)));
$since = date('Y-m-d', time() - $days * 86400) . ' 00:00:00';

$conditions = ["e.event_type = 'hours_logged'", 'e.created_at >= :since'];
$params = [':since' => $since];
if (!$isAdmin) {
    $conditions[] = 'e.username = :username';
    $params[':username'] = $currentUser;
}

$stmt = $pdo->prepare(
    'SELECT e.username, t.settore, DATE(e.created_at) AS giorno, SUM(CAST(e.new_value AS DECIMAL(10,2))) AS ore
     FROM task_events e LEFT JOIN tasks t ON t.id = e.task_id
     WHERE ' . implode(' AND ', $conditions) . '
     GROUP BY e.username, t.settore, DATE(e.created_at)
     ORDER BY giorno ASC'
);
$stmt->execute($params);

$hours = array_map(static fn (array $row): array => [
    'username' => (string) $row['username'],
    'settore' => $row['settore'] !== null ? (string) $row['settore'] : null,
    'giorno' => (string) $row['giorno'],
    'ore' => round((float) $row['ore'], 2),
], $stmt->fetchAll());

jsonResponse(['success' => true, 'since' => substr($since, 0, 10), 'hours' => $hours]);
