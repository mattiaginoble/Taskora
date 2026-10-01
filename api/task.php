<?php

declare(strict_types=1);

require __DIR__ . '/database.php';

startSecureSession();
sendApiHeaders();

$pdo = getPdo();
$sessionUser = requireAuthenticatedUser();
$currentUser = $sessionUser['username'] ?? '';
$isAdmin = isAdministrator($sessionUser);
$method = $_SERVER['REQUEST_METHOD'];

// Campi confrontati per il registro eventi quando un'attività viene modificata.
const TRACKED_FIELDS = ['utente', 'progetto', 'descrizione', 'scadenza', 'priorita', 'settore', 'stato', 'avanzamento'];

function normalizeMilestoneText(string $value): string
{
    $normalized = str_replace(["\r\n", "\r"], "\n", $value);

    return trim($normalized);
}

function buildMilestoneEntry(string $username, string $message): string
{
    $timestamp = date('Y-m-d H:i');
    $cleanMessage = normalizeMilestoneText($message);

    return "[{$timestamp}] {$username}: {$cleanMessage}";
}

function appendMilestoneHistory(string $existingHistory, string $username, string $message): string
{
    $newMessage = normalizeMilestoneText($message);
    if ($newMessage === '') {
        return trim($existingHistory);
    }

    $newEntry = buildMilestoneEntry($username, $newMessage);
    $existing = trim($existingHistory);

    if ($existing === '') {
        return $newEntry;
    }

    return $existing . "\n" . $newEntry;
}

function isValidIsoDate(string $value): bool
{
    $date = DateTimeImmutable::createFromFormat('!Y-m-d', $value);

    return $date !== false && $date->format('Y-m-d') === $value;
}

// Nome del progetto come salvato in anagrafica, oppure errore 422.
function resolveProjectName(PDO $pdo, string $name): string
{
    $name = trim($name);
    if ($name === '') {
        jsonResponse(['success' => false, 'error' => 'Il progetto è obbligatorio'], 422);
    }

    $stmt = $pdo->prepare('SELECT nome FROM projects WHERE LOWER(nome) = LOWER(:nome) LIMIT 1');
    $stmt->execute([':nome' => $name]);
    $project = $stmt->fetchColumn();
    if ($project === false) {
        jsonResponse(['success' => false, 'error' => 'Il progetto selezionato non esiste'], 422);
    }

    return (string) $project;
}

// Titolare dell'attività scelto da un admin: deve essere un utente esistente.
function validateTaskOwner(PDO $pdo, string $username): string
{
    $stmt = $pdo->prepare('SELECT username FROM users WHERE LOWER(username) = LOWER(:username) LIMIT 1');
    $stmt->execute([':username' => trim($username)]);
    $owner = $stmt->fetchColumn();
    if ($owner === false) {
        jsonResponse(['success' => false, 'error' => 'Il dipendente selezionato non esiste'], 422);
    }

    return (string) $owner;
}

function validateStatus($value): string
{
    $status = trim((string) $value);
    if (!in_array($status, TASK_STATUSES, true)) {
        jsonResponse(['success' => false, 'error' => 'Stato non valido'], 422);
    }

    return $status;
}

function validatePriority($value): string
{
    $priority = trim((string) $value);
    if (!in_array($priority, TASK_PRIORITIES, true)) {
        jsonResponse(['success' => false, 'error' => 'Priorità non valida'], 422);
    }

    return $priority;
}

function validateProgress($value): int
{
    if (!is_numeric($value)) {
        jsonResponse(['success' => false, 'error' => 'L\'avanzamento deve essere un numero'], 422);
    }
    $progress = (int) $value;
    if ($progress < 0 || $progress > 100) {
        jsonResponse(['success' => false, 'error' => 'L\'avanzamento deve essere compreso tra 0 e 100'], 422);
    }

    return $progress;
}

// Settore: uno di quelli in anagrafica (senza distinzione di maiuscole).
function validateSector(PDO $pdo, $value): string
{
    $sector = trim((string) $value);
    if ($sector === '') {
        jsonResponse(['success' => false, 'error' => 'Il settore è obbligatorio'], 422);
    }
    foreach (fetchSectors($pdo) as $allowed) {
        if (strcasecmp($allowed, $sector) === 0) {
            return $allowed;
        }
    }
    jsonResponse(['success' => false, 'error' => 'Settore non valido'], 422);
}

// Ore lavorate da aggiungere: facoltative, da 0,25 a 24 per registrazione.
function validateHours($value): float
{
    $raw = str_replace(',', '.', trim((string) $value));
    if ($raw === '') {
        return 0.0;
    }
    if (!is_numeric($raw)) {
        jsonResponse(['success' => false, 'error' => 'Le ore lavorate devono essere un numero'], 422);
    }
    $hours = round((float) $raw, 2);
    if ($hours < 0.25 || $hours > 24) {
        jsonResponse(['success' => false, 'error' => 'Le ore lavorate devono essere tra 0,25 e 24'], 422);
    }

    return $hours;
}

function validateDueDate($value, bool $allowPast): string
{
    $dueDate = trim((string) $value);
    if (!isValidIsoDate($dueDate)) {
        jsonResponse(['success' => false, 'error' => 'La scadenza deve essere una data valida (YYYY-MM-DD)'], 422);
    }
    if (!$allowPast && $dueDate < date('Y-m-d')) {
        jsonResponse(['success' => false, 'error' => 'La scadenza non può essere nel passato'], 422);
    }

    return $dueDate;
}

// Date di inizio e fine lavoro ricavate da stato e avanzamento.
function applyWorkTimestamps(array $task, ?string $previousStatus, string $now): array
{
    $isWorking = in_array($task['stato'], ['In corso', 'Completato'], true) || $task['avanzamento'] > 0;
    if (empty($task['started_at']) && $isWorking) {
        $task['started_at'] = $now;
    }

    if ($task['stato'] === 'Completato') {
        if ($previousStatus !== 'Completato' || empty($task['completed_at'])) {
            $task['completed_at'] = $now;
        }
    } else {
        $task['completed_at'] = null;
    }

    return $task;
}

if ($method === 'GET') {
    if (isset($_GET['mode']) && $_GET['mode'] === 'projects') {
        $projects = $pdo->query('SELECT id, nome FROM projects ORDER BY nome ASC')->fetchAll();
        jsonResponse(['success' => true, 'projects' => $projects]);
    }

    $settore = isset($_GET['settore']) ? trim((string) $_GET['settore']) : '';
    jsonResponse(['success' => true, 'tasks' => fetchTasks($pdo, $isAdmin, $currentUser, $settore)]);
}

if ($method === 'POST') {
    $input = readJsonInput();

    $taskUser = $currentUser;
    if ($isAdmin && isset($input['utente']) && trim((string) $input['utente']) !== '') {
        $taskUser = validateTaskOwner($pdo, (string) $input['utente']);
    }

    $progetto = resolveProjectName($pdo, (string) ($input['progetto'] ?? ''));

    $firstTask = normalizeMilestoneText((string) ($input['note'] ?? ''));
    if ($firstTask === '') {
        jsonResponse(['success' => false, 'error' => 'La task è obbligatoria'], 422);
    }

    // Gli admin possono impostare qualsiasi scadenza, i dipendenti solo da oggi in poi.
    $scadenza = date('Y-m-d');
    if (isset($input['scadenza']) && trim((string) $input['scadenza']) !== '') {
        $scadenza = validateDueDate($input['scadenza'], $isAdmin);
    }


    $stato = 'Da fare';
    if ($isAdmin && isset($input['stato']) && trim((string) $input['stato']) !== '') {
        $stato = validateStatus($input['stato']);
    }

    $avanzamento = array_key_exists('avanzamento', $input) ? validateProgress($input['avanzamento']) : 0;

    $priorita = 'Media';
    if ($isAdmin && isset($input['priorita']) && trim((string) $input['priorita']) !== '') {
        $priorita = validatePriority($input['priorita']);
    }

    $settore = validateSector($pdo, $input['settore'] ?? '');
    $hours = validateHours($input['ore'] ?? '');
    $now = date('Y-m-d H:i:s');

    $task = applyWorkTimestamps([
        'id' => uniqid('task_', true),
        'utente' => $taskUser,
        'progetto' => $progetto,
        'descrizione' => trim((string) ($input['descrizione'] ?? '-')) ?: '-',
        'scadenza' => $scadenza,
        // "Assegnato da": sempre chi crea l'attività, non si sceglie
        'creato_da' => $currentUser,
        'assegnato_a' => null,
        'priorita' => $priorita,
        'settore' => $settore,
        'note' => appendMilestoneHistory('', $currentUser, $firstTask),
        'stato' => $stato,
        'avanzamento' => $avanzamento,
        'ore_lavorate' => $hours,
        'created_at' => $now,
        'started_at' => null,
        'completed_at' => null,
        'updated_at' => $now,
    ], null, $now);

    $pdo->beginTransaction();
    $pdo->prepare(
        'INSERT INTO tasks (id, utente, creato_da, progetto, descrizione, scadenza, assegnato_a, priorita, settore, note, stato, avanzamento, ore_lavorate, created_at, started_at, completed_at, updated_at)
         VALUES (:id, :utente, :creato_da, :progetto, :descrizione, :scadenza, :assegnato_a, :priorita, :settore, :note, :stato, :avanzamento, :ore_lavorate, :created_at, :started_at, :completed_at, :updated_at)'
    )->execute(array_combine(
        array_map(static fn ($key) => ':' . $key, array_keys($task)),
        array_values($task)
    ));
    logTaskEvent($pdo, $task['id'], $currentUser, 'created', null, null, json_encode([
        'utente' => $task['utente'],
        'progetto' => $task['progetto'],
        'scadenza' => $task['scadenza'],
        'priorita' => $task['priorita'],
        'stato' => $task['stato'],
        'avanzamento' => $task['avanzamento'],
    ], JSON_UNESCAPED_UNICODE));
    logTaskEvent($pdo, $task['id'], $currentUser, 'task_added', null, null, $firstTask);
    if ($hours > 0) {
        logTaskEvent($pdo, $task['id'], $currentUser, 'hours_logged', 'ore_lavorate', null, (string) $hours);
    }
    $pdo->commit();

    jsonResponse(['success' => true, 'task' => fetchTaskById($pdo, $task['id'])]);
}

if ($method === 'PUT') {
    $input = readJsonInput();

    $taskId = trim((string) ($input['id'] ?? ''));
    if ($taskId === '') {
        jsonResponse(['success' => false, 'error' => 'ID attività obbligatorio'], 422);
    }

    $pdo->beginTransaction();
    $existing = fetchTaskById($pdo, $taskId, true);
    if (!$existing) {
        $pdo->rollBack();
        jsonResponse(['success' => false, 'error' => 'Attività non trovata'], 404);
    }

    // I dipendenti possono aggiornare solo le proprie attività.
    $isOwner = strcasecmp((string) $existing['utente'], $currentUser) === 0;
    if (!$isAdmin && !$isOwner) {
        $pdo->rollBack();
        jsonResponse(['success' => false, 'error' => 'Non puoi modificare questa attività'], 403);
    }

    $updated = $existing;

    // Campi modificabili da tutti: stato, avanzamento e nuove task in coda.
    if (array_key_exists('stato', $input)) {
        $updated['stato'] = validateStatus($input['stato']);
    }
    if (array_key_exists('avanzamento', $input)) {
        $updated['avanzamento'] = validateProgress($input['avanzamento']);
    }

    // Campi riservati agli admin; per i dipendenti vengono ignorati.
    if ($isAdmin) {
        if (isset($input['utente']) && trim((string) $input['utente']) !== '') {
            $updated['utente'] = validateTaskOwner($pdo, (string) $input['utente']);
        }
        if (array_key_exists('progetto', $input)) {
            $updated['progetto'] = resolveProjectName($pdo, (string) $input['progetto']);
        }
        if (array_key_exists('scadenza', $input)) {
            $updated['scadenza'] = validateDueDate($input['scadenza'], true);
        }
        if (isset($input['priorita']) && trim((string) $input['priorita']) !== '') {
            $updated['priorita'] = validatePriority($input['priorita']);
        }
        if (array_key_exists('settore', $input)) {
            $updated['settore'] = validateSector($pdo, $input['settore']);
        }
        if (array_key_exists('descrizione', $input)) {
            $updated['descrizione'] = trim((string) $input['descrizione']) ?: '-';
        }
        if (array_key_exists('note', $input)) {
            $updated['note'] = normalizeMilestoneText((string) $input['note']);
        }
    }

    $appendedTask = normalizeMilestoneText((string) ($input['note_append'] ?? ''));
    if ($appendedTask !== '') {
        $updated['note'] = appendMilestoneHistory((string) $updated['note'], $currentUser, $appendedTask);
    }

    // Ore lavorate: si sommano al totale dell'attività, non si sovrascrivono.
    $hours = validateHours($input['ore'] ?? '');
    $updated['ore_lavorate'] = round((float) $existing['ore_lavorate'] + $hours, 2);

    $changedFields = array_values(array_filter(
        TRACKED_FIELDS,
        static fn ($field) => (string) ($existing[$field] ?? '') !== (string) ($updated[$field] ?? '')
    ));
    $historyEdited = $isAdmin && array_key_exists('note', $input)
        && normalizeMilestoneText((string) $input['note']) !== normalizeMilestoneText((string) ($existing['note'] ?? ''));

    if (!$changedFields && !$historyEdited && $appendedTask === '' && $hours <= 0) {
        $pdo->commit();
        jsonResponse(['success' => true, 'task' => $existing]);
    }

    $now = date('Y-m-d H:i:s');
    $updated = applyWorkTimestamps($updated, $existing['stato'], $now);
    $updated['updated_at'] = $now;

    $pdo->prepare(
        'UPDATE tasks SET utente = :utente, progetto = :progetto, descrizione = :descrizione, scadenza = :scadenza,
         priorita = :priorita, settore = :settore, note = :note, stato = :stato,
         avanzamento = :avanzamento, ore_lavorate = :ore_lavorate, started_at = :started_at, completed_at = :completed_at, updated_at = :updated_at
         WHERE id = :id'
    )->execute([
        ':id' => $taskId,
        ':utente' => $updated['utente'],
        ':progetto' => $updated['progetto'],
        ':descrizione' => $updated['descrizione'],
        ':scadenza' => $updated['scadenza'],
        ':priorita' => $updated['priorita'],
        ':settore' => $updated['settore'],
        ':note' => $updated['note'],
        ':stato' => $updated['stato'],
        ':avanzamento' => $updated['avanzamento'],
        ':ore_lavorate' => $updated['ore_lavorate'],
        ':started_at' => $updated['started_at'],
        ':completed_at' => $updated['completed_at'],
        ':updated_at' => $updated['updated_at'],
    ]);

    foreach ($changedFields as $field) {
        logTaskEvent(
            $pdo,
            $taskId,
            $currentUser,
            'field_changed',
            $field,
            $existing[$field] === null ? null : (string) $existing[$field],
            $updated[$field] === null ? null : (string) $updated[$field]
        );
    }
    if ($historyEdited) {
        logTaskEvent($pdo, $taskId, $currentUser, 'history_edited', 'note', (string) ($existing['note'] ?? ''), normalizeMilestoneText((string) $input['note']));
    }
    if ($appendedTask !== '') {
        logTaskEvent($pdo, $taskId, $currentUser, 'task_added', null, null, $appendedTask);
    }
    if ($hours > 0) {
        logTaskEvent($pdo, $taskId, $currentUser, 'hours_logged', 'ore_lavorate', (string) $existing['ore_lavorate'], (string) $hours);
    }
    $pdo->commit();

    jsonResponse(['success' => true, 'task' => fetchTaskById($pdo, $taskId)]);
}

if ($method === 'DELETE') {
    $id = isset($_GET['id']) ? trim((string) $_GET['id']) : '';
    if ($id === '') {
        jsonResponse(['success' => false, 'error' => 'ID attività obbligatorio'], 422);
    }

    if (!$isAdmin) {
        jsonResponse(['success' => false, 'error' => 'Solo l\'administrator può eliminare le attività'], 403);
    }

    $pdo->beginTransaction();
    if (!fetchTaskById($pdo, $id, true)) {
        $pdo->rollBack();
        jsonResponse(['success' => false, 'error' => 'Attività non trovata'], 404);
    }

    // Eliminazione logica: il record resta nel database e l'evento nel registro.
    $now = date('Y-m-d H:i:s');
    $pdo->prepare('UPDATE tasks SET deleted_at = :deleted_at, deleted_by = :user, updated_at = :updated_at WHERE id = :id')
        ->execute([':deleted_at' => $now, ':user' => $currentUser, ':updated_at' => $now, ':id' => $id]);
    logTaskEvent($pdo, $id, $currentUser, 'deleted');
    $pdo->commit();

    jsonResponse(['success' => true, 'id' => $id]);
}

jsonResponse(['success' => false, 'error' => 'Metodo non consentito'], 405);
