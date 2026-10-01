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
    jsonResponse(['success' => false, 'error' => 'Riepilogo riservato agli amministratori'], 403);
}

$pdo = getPdo();

// Soglie dei segnali anomali.
const STALE_DAYS = 7;          // attività aperta senza aggiornamenti
const PROGRESS_JUMP = 50;      // punti di avanzamento in un solo aggiornamento
const BURST_COUNT = 5;         // task inserite...
const BURST_MINUTES = 15;      // ...entro questi minuti

$days = max(7, min(365, (int) ($_GET['days'] ?? 30)));
$nowTs = time();
$today = date('Y-m-d');
$since = date('Y-m-d H:i:s', $nowTs - $days * 86400);

function daysBetween(string $from, int $toTs): int
{
    return (int) floor(($toTs - strtotime($from)) / 86400);
}

// Voci "[AAAA-MM-GG HH:MM] utente: testo" del campo note.
function parseNoteEntries(string $note): array
{
    preg_match_all('/^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2})\]\s*([^:\n]+):/m', $note, $matches, PREG_SET_ORDER);

    return array_map(static fn ($m) => ['at' => $m[1] . ':00', 'user' => trim($m[2])], $matches);
}

// Filtro facoltativo per settore: ?settore=IT
$sector = trim((string) ($_GET['settore'] ?? ''));
$tasks = fetchTasks($pdo, true, '', $sector);

// Dipendenti seguiti: tutti i non admin, più chiunque sia titolare di attività.
$stats = [];
$ensureUser = static function (string $username) use (&$stats): void {
    if ($username !== '' && !isset($stats[$username])) {
        $stats[$username] = [
            'username' => $username,
            'attivita_aperte' => 0,
            'scadute' => 0,
            'bloccate' => 0,
            'completate_periodo' => 0,
            'task_inserite_periodo' => 0,
            'ore_periodo' => 0.0,
            'giorni_attivi' => [],
            'ultimo_aggiornamento' => null,
            'durate' => [],
            'segnali' => 0,
        ];
    }
};
foreach ($pdo->query('SELECT username, role FROM users ORDER BY username')->fetchAll() as $user) {
    if ($sector === '' && !isAdministrator($user)) {
        $ensureUser($user['username']);
    }
}
// Prima tutti gli owner, così il lavoro che fanno sulle task degli altri conta
// qualunque sia l'ordine delle task.
foreach ($tasks as $task) {
    $ensureUser((string) $task['utente']);
}

$signals = [];
$addSignal = static function (string $type, string $severity, string $username, ?array $task, string $detail, ?string $at) use (&$signals, &$stats): void {
    $signals[] = [
        'type' => $type,
        'severity' => $severity,
        'username' => $username,
        'task_id' => $task['id'] ?? null,
        'progetto' => $task['progetto'] ?? null,
        'detail' => $detail,
        'at' => $at,
    ];
    if (isset($stats[$username])) {
        $stats[$username]['segnali']++;
    }
};
$touch = static function (string $username, ?string $at) use (&$stats): void {
    if ($at && isset($stats[$username]) && ($stats[$username]['ultimo_aggiornamento'] === null || $at > $stats[$username]['ultimo_aggiornamento'])) {
        $stats[$username]['ultimo_aggiornamento'] = $at;
    }
};

// ── Stato attuale delle attività ─────────────────────────────────────────────
foreach ($tasks as $task) {
    $owner = (string) $task['utente'];
    $ensureUser($owner);
    $isOpen = $task['stato'] !== 'Completato';
    // Lavoro registrato sulla task: la sua creazione e le note scritte dopo
    $entries = parseNoteEntries((string) ($task['note'] ?? ''));
    if ($task['creato_da']) {
        array_unshift($entries, ['at' => $task['created_at'], 'user' => (string) $task['creato_da']]);
    }

    if ($isOpen) {
        $stats[$owner]['attivita_aperte']++;
        if ($task['stato'] === 'Bloccato') {
            $stats[$owner]['bloccate']++;
        }
    }

    foreach ($entries as $entry) {
        if (!isset($stats[$entry['user']])) {
            continue;
        }
        $touch($entry['user'], $entry['at']);
        if ($entry['at'] >= $since) {
            $stats[$entry['user']]['task_inserite_periodo']++;
            $stats[$entry['user']]['giorni_attivi'][substr($entry['at'], 0, 10)] = true;
        }
    }

    $lastEntry = $entries ? end($entries)['at'] : null;
    $lastTouch = max(array_filter([$task['updated_at'], $task['created_at'], $lastEntry]));

    if ($isOpen && $task['scadenza'] < $today) {
        $stats[$owner]['scadute']++;
        $late = daysBetween($task['scadenza'], $nowTs);
        $addSignal('overdue', $late > 7 ? 'alta' : 'media', $owner, $task, "Scaduta da {$late} giorni", $task['scadenza']);
    }

    $idle = daysBetween($lastTouch, $nowTs);
    if ($isOpen && $idle >= STALE_DAYS) {
        $addSignal('stale', $idle >= 2 * STALE_DAYS ? 'alta' : 'media', $owner, $task, "Nessun aggiornamento da {$idle} giorni", $lastTouch);
    }

    if (!$isOpen && $task['completed_at'] && $task['completed_at'] >= $since) {
        $stats[$owner]['completate_periodo']++;
        $stats[$owner]['durate'][] = (strtotime($task['completed_at']) - strtotime($task['created_at'])) / 86400;
    }
}

// ── Eventi del periodo ───────────────────────────────────────────────────────
$stmt = $pdo->prepare(
    'SELECT e.task_id, e.username, e.event_type, e.field, e.old_value, e.new_value, e.created_at, t.utente, t.progetto
     FROM task_events e LEFT JOIN tasks t ON t.id = e.task_id
     WHERE e.created_at >= :since' . ($sector !== '' ? ' AND t.settore = :settore' : '') . ' ORDER BY e.created_at ASC, e.id ASC'
);
$stmt->execute($sector !== '' ? [':since' => $since, ':settore' => $sector] : [':since' => $since]);
$events = $stmt->fetchAll();

// Note aggiunte per (task, utente, istante): servono a capire se un salto di
// avanzamento è accompagnato da una descrizione del lavoro. "task_added" è il
// nome che avevano prima che le attività diventassero task singole.
$taskAddedAt = [];
$addedByUser = [];
foreach ($events as $event) {
    if ($event['event_type'] === 'hours_logged' && isset($stats[$event['username']])) {
        $stats[$event['username']]['ore_periodo'] += (float) $event['new_value'];
    }
    // Qualsiasi modifica conta come attività del suo autore
    $touch((string) $event['username'], $event['created_at']);
    if (in_array($event['event_type'], ['note_added', 'task_added'], true)) {
        $taskAddedAt[$event['task_id'] . '|' . $event['username'] . '|' . $event['created_at']] = true;
        $addedByUser[$event['username']][] = $event;
    }
}

foreach ($events as $event) {
    $task = ['id' => $event['task_id'], 'progetto' => $event['progetto']];
    $actor = (string) $event['username'];

    if ($event['event_type'] === 'field_changed' && $event['field'] === 'avanzamento') {
        $jump = (int) $event['new_value'] - (int) $event['old_value'];
        if ($jump >= PROGRESS_JUMP) {
            $described = isset($taskAddedAt[$event['task_id'] . '|' . $actor . '|' . $event['created_at']]);
            $addSignal(
                'progress_jump',
                $described ? 'media' : 'alta',
                $actor,
                $task,
                "Avanzamento da {$event['old_value']}% a {$event['new_value']}% in un solo aggiornamento" . ($described ? '' : ', senza note'),
                $event['created_at']
            );
        }
    } elseif ($event['event_type'] === 'field_changed' && $event['field'] === 'scadenza'
        && (string) $event['new_value'] > (string) $event['old_value']) {
        $addSignal('due_date_postponed', 'info', (string) ($event['utente'] ?? $actor), $task, "Scadenza spostata da {$event['old_value']} a {$event['new_value']} (da {$actor})", $event['created_at']);
    } elseif ($event['event_type'] === 'history_edited') {
        $addSignal('history_edited', 'alta', $actor, $task, 'Note della task riscritte', $event['created_at']);
    } elseif ($event['event_type'] === 'deleted') {
        $addSignal('deleted', 'media', $actor, $task, 'Task eliminata', $event['created_at']);
    }
}

// Molte note scritte in pochi minuti: aggiornamenti scritti tutti insieme.
foreach ($addedByUser as $username => $added) {
    $count = count($added);
    for ($start = 0; $start < $count; $start++) {
        $end = $start;
        while ($end + 1 < $count && strtotime($added[$end + 1]['created_at']) - strtotime($added[$start]['created_at']) <= BURST_MINUTES * 60) {
            $end++;
        }
        $size = $end - $start + 1;
        if ($size >= BURST_COUNT) {
            $addSignal('burst', 'info', (string) $username, null, "{$size} note scritte in meno di " . BURST_MINUTES . ' minuti', $added[$start]['created_at']);
            $start = $end;
        }
    }
}

// Dipendenti con task aperte ma senza aggiornamenti recenti.
foreach ($stats as $username => $userStats) {
    $last = $userStats['ultimo_aggiornamento'];
    if ($userStats['attivita_aperte'] > 0 && ($last === null || daysBetween($last, $nowTs) >= STALE_DAYS)) {
        $addSignal(
            'inactive_user',
            'alta',
            $username,
            null,
            $last === null ? 'Nessun aggiornamento registrato' : 'Nessun aggiornamento da ' . daysBetween($last, $nowTs) . ' giorni',
            $last
        );
    }
}

$users = array_values(array_map(static function (array $s) use ($nowTs): array {
    $durations = $s['durate'];

    return [
        'username' => $s['username'],
        'attivita_aperte' => $s['attivita_aperte'],
        'scadute' => $s['scadute'],
        'bloccate' => $s['bloccate'],
        'completate_periodo' => $s['completate_periodo'],
        'task_inserite_periodo' => $s['task_inserite_periodo'],
        'ore_periodo' => round($s['ore_periodo'], 2),
        'giorni_attivi' => count($s['giorni_attivi']),
        'ultimo_aggiornamento' => $s['ultimo_aggiornamento'],
        'giorni_da_ultimo' => $s['ultimo_aggiornamento'] ? daysBetween($s['ultimo_aggiornamento'], $nowTs) : null,
        'tempo_medio_completamento' => $durations ? round(array_sum($durations) / count($durations), 1) : null,
        'segnali' => $s['segnali'],
    ];
}, $stats));

$severityRank = ['alta' => 0, 'media' => 1, 'info' => 2];
usort($signals, static fn ($a, $b) => [$severityRank[$a['severity']], (string) $b['at']] <=> [$severityRank[$b['severity']], (string) $a['at']]);

jsonResponse([
    'success' => true,
    'sector' => $sector,
    'sectors' => fetchSectors($pdo),
    'people' => fetchPeople($pdo),
    'period' => ['days' => $days, 'from' => $since, 'to' => date('Y-m-d H:i:s', $nowTs)],
    'thresholds' => [
        'stale_days' => STALE_DAYS,
        'progress_jump' => PROGRESS_JUMP,
        'burst_count' => BURST_COUNT,
        'burst_minutes' => BURST_MINUTES,
    ],
    'users' => $users,
    'signals' => $signals,
]);
