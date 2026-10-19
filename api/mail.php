<?php

declare(strict_types=1);

function getMailConfig(): array
{
    $config = getAppConfig();
    $mail = $config['mail'] ?? [];

    return [
        'driver' => strtolower((string) ($mail['driver'] ?? 'mail')),
        'host' => (string) ($mail['host'] ?? 'localhost'),
        'port' => (int) ($mail['port'] ?? 25),
        'username' => (string) ($mail['username'] ?? ''),
        'password' => (string) ($mail['password'] ?? ''),
        'encryption' => strtolower((string) ($mail['encryption'] ?? '')),
        'from_address' => (string) ($mail['from_address'] ?? 'noreply@taskora.local'),
        'from_name' => (string) ($mail['from_name'] ?? 'Taskora'),
        'app_url' => rtrim((string) ($config['app_url'] ?? ''), '/'),
    ];
}

function formatMailAddress(string $name, string $email): string
{
    $cleanEmail = trim($email);
    $cleanName = trim($name);
    if ($cleanName === '') {
        return "<{$cleanEmail}>";
    }

    $encodedName = '=?UTF-8?B?' . base64_encode($cleanName) . '?=';

    return "{$encodedName} <{$cleanEmail}>";
}

function sendSmtpEmail(array $config, string $to, string $subject, string $htmlBody, string $textBody): bool
{
    $host = $config['host'];
    $port = $config['port'];
    $encryption = $config['encryption'];
    $username = $config['username'];
    $password = $config['password'];
    $fromAddress = $config['from_address'];
    $fromName = $config['from_name'];

    $protocol = ($encryption === 'ssl' || $port === 465) ? 'ssl://' : 'tcp://';
    $remote = $protocol . $host . ':' . $port;

    $context = stream_context_create([
        'ssl' => [
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true,
        ],
    ]);

    $socket = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $context);
    if (!$socket) {
        error_log("Taskora SMTP connect error to {$remote}: [{$errno}] {$errstr}");

        return false;
    }

    stream_set_timeout($socket, 15);

    $readResponse = static function ($socket): string {
        $data = '';
        while (!feof($socket)) {
            $line = fgets($socket, 512);
            if ($line === false) {
                break;
            }
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') {
                break;
            }
        }

        return $data;
    };

    $sendCommand = static function ($socket, string $cmd) use ($readResponse): string {
        fwrite($socket, $cmd . "\r\n");

        return $readResponse($socket);
    };

    $resp = $readResponse($socket);
    if (!str_starts_with($resp, '220')) {
        error_log("Taskora SMTP greeting error: {$resp}");
        fclose($socket);

        return false;
    }

    $clientName = gethostname() ?: 'localhost';
    $resp = $sendCommand($socket, "EHLO {$clientName}");

    if ($encryption === 'tls' || ($port === 587 && $encryption !== 'ssl')) {
        $resp = $sendCommand($socket, 'STARTTLS');
        if (!str_starts_with($resp, '220')) {
            error_log("Taskora SMTP STARTTLS failed: {$resp}");
            fclose($socket);

            return false;
        }

        $cryptoOk = stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        if (!$cryptoOk) {
            error_log('Taskora SMTP crypto negotiation failed');
            fclose($socket);

            return false;
        }

        $resp = $sendCommand($socket, "EHLO {$clientName}");
    }

    if ($username !== '' && $password !== '') {
        $resp = $sendCommand($socket, 'AUTH LOGIN');
        if (!str_starts_with($resp, '334')) {
            error_log("Taskora SMTP AUTH LOGIN rejection: {$resp}");
            fclose($socket);

            return false;
        }

        $resp = $sendCommand($socket, base64_encode($username));
        if (!str_starts_with($resp, '334')) {
            error_log("Taskora SMTP username rejection: {$resp}");
            fclose($socket);

            return false;
        }

        $resp = $sendCommand($socket, base64_encode($password));
        if (!str_starts_with($resp, '235')) {
            error_log("Taskora SMTP password rejection: {$resp}");
            fclose($socket);

            return false;
        }
    }

    $resp = $sendCommand($socket, "MAIL FROM:<{$fromAddress}>");
    if (!str_starts_with($resp, '250')) {
        error_log("Taskora SMTP MAIL FROM error: {$resp}");
        fclose($socket);

        return false;
    }

    $resp = $sendCommand($socket, "RCPT TO:<{$to}>");
    if (!str_starts_with($resp, '250') && !str_starts_with($resp, '251')) {
        error_log("Taskora SMTP RCPT TO error: {$resp}");
        fclose($socket);

        return false;
    }

    $resp = $sendCommand($socket, 'DATA');
    if (!str_starts_with($resp, '354')) {
        error_log("Taskora SMTP DATA error: {$resp}");
        fclose($socket);

        return false;
    }

    $boundary = '=_Part_' . bin2hex(random_bytes(16));
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $fromHeader = formatMailAddress($fromName, $fromAddress);

    $msg = 'Date: ' . date(DATE_RFC2822) . "\r\n";
    $msg .= "From: {$fromHeader}\r\n";
    $msg .= "To: <{$to}>\r\n";
    $msg .= "Subject: {$encodedSubject}\r\n";
    $msg .= "MIME-Version: 1.0\r\n";
    $msg .= "Content-Type: multipart/alternative; boundary=\"{$boundary}\"\r\n";
    $msg .= "X-Mailer: Taskora\r\n\r\n";

    $msg .= "--{$boundary}\r\n";
    $msg .= "Content-Type: text/plain; charset=UTF-8\r\n";
    $msg .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $msg .= chunk_split(base64_encode($textBody)) . "\r\n";

    $msg .= "--{$boundary}\r\n";
    $msg .= "Content-Type: text/html; charset=UTF-8\r\n";
    $msg .= "Content-Transfer-Encoding: base64\r\n\r\n";
    $msg .= chunk_split(base64_encode($htmlBody)) . "\r\n";

    $msg .= "--{$boundary}--\r\n";
    $msg .= "\r\n.\r\n";

    fwrite($socket, $msg);
    $resp = $readResponse($socket);

    $sendCommand($socket, 'QUIT');
    fclose($socket);

    if (!str_starts_with($resp, '250')) {
        error_log("Taskora SMTP send error: {$resp}");

        return false;
    }

    return true;
}

function sendNativeMail(array $config, string $to, string $subject, string $htmlBody, string $textBody): bool
{
    $fromAddress = $config['from_address'];
    $fromName = $config['from_name'];
    $boundary = '=_Part_' . bin2hex(random_bytes(16));
    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';
    $fromHeader = formatMailAddress($fromName, $fromAddress);

    $headers = [
        'Date: ' . date(DATE_RFC2822),
        'From: ' . $fromHeader,
        'Reply-To: ' . $fromHeader,
        'MIME-Version: 1.0',
        'Content-Type: multipart/alternative; boundary="' . $boundary . '"',
        'X-Mailer: Taskora',
    ];

    $body = "--{$boundary}\r\n" .
            "Content-Type: text/plain; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($textBody)) . "\r\n" .
            "--{$boundary}\r\n" .
            "Content-Type: text/html; charset=UTF-8\r\n" .
            "Content-Transfer-Encoding: base64\r\n\r\n" .
            chunk_split(base64_encode($htmlBody)) . "\r\n" .
            "--{$boundary}--";

    $res = @mail($to, $encodedSubject, $body, implode("\r\n", $headers));
    if (!$res) {
        error_log("Taskora: invio mail nativa fallito a <{$to}>");
    }

    return (bool) $res;
}

function sendEmail(string $to, string $subject, string $htmlBody, string $textBody): bool
{
    try {
        $config = getMailConfig();
        if ($config['driver'] === 'smtp') {
            return sendSmtpEmail($config, $to, $subject, $htmlBody, $textBody);
        }

        return sendNativeMail($config, $to, $subject, $htmlBody, $textBody);
    } catch (Throwable $e) {
        error_log('Taskora mail exception: ' . $e->getMessage());

        return false;
    }
}

function notifyTaskAssigned(PDO $pdo, array $task, string $assignedByUsername): bool
{
    $assigneeUsername = trim((string) ($task['utente'] ?? ''));
    if ($assigneeUsername === '') {
        return false;
    }

    $toEmail = fetchUserEmail($pdo, $assigneeUsername);
    if (!$toEmail) {
        return false;
    }

    $people = fetchPeople($pdo);
    $assigneeDisplayName = $people[$assigneeUsername] ?? $assigneeUsername;
    $assignedByDisplayName = $people[$assignedByUsername] ?? $assignedByUsername;

    $taskTitle = (string) ($task['titolo'] ?? 'Attività senza titolo');
    $project = (string) ($task['progetto'] ?? '-');
    $sector = (string) ($task['settore'] ?? '-');
    $priority = (string) ($task['priorita'] ?? 'Media');
    $dueDate = (string) ($task['scadenza'] ?? '-');
    $description = trim((string) ($task['descrizione'] ?? ''));
    $note = trim((string) ($task['note'] ?? ''));

    $config = getMailConfig();
    $appUrl = $config['app_url'];
    if ($appUrl === '' && isset($_SERVER['HTTP_HOST'])) {
        $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
        $appUrl = "{$scheme}://{$_SERVER['HTTP_HOST']}";
    }

    $subject = "Nuova task assegnata: {$taskTitle}";

    $textBody = "Ciao {$assigneeDisplayName},\n\n"
        . "Ti è stata assegnata una nuova attività su Taskora da {$assignedByDisplayName}:\n\n"
        . "Task: {$taskTitle}\n"
        . "Progetto: {$project}\n"
        . "Settore: {$sector}\n"
        . "Priorità: {$priority}\n"
        . "Scadenza: {$dueDate}\n";

    if ($description !== '' && $description !== '-') {
        $textBody .= "\nDescrizione:\n{$description}\n";
    }
    if ($note !== '') {
        $textBody .= "\nNote:\n{$note}\n";
    }
    if ($appUrl !== '') {
        $textBody .= "\nAccedi a Taskora per visualizzarla:\n{$appUrl}\n";
    }
    $textBody .= "\n---\nNotifica automatica inviata da Taskora\n";

    $safeTitle = htmlspecialchars($taskTitle, ENT_QUOTES, 'UTF-8');
    $safeAssignee = htmlspecialchars($assigneeDisplayName, ENT_QUOTES, 'UTF-8');
    $safeAssignedBy = htmlspecialchars($assignedByDisplayName, ENT_QUOTES, 'UTF-8');
    $safeProject = htmlspecialchars($project, ENT_QUOTES, 'UTF-8');
    $safeSector = htmlspecialchars($sector, ENT_QUOTES, 'UTF-8');
    $safePriority = htmlspecialchars($priority, ENT_QUOTES, 'UTF-8');
    $safeDueDate = htmlspecialchars($dueDate, ENT_QUOTES, 'UTF-8');
    $safeDesc = ($description !== '' && $description !== '-') ? nl2br(htmlspecialchars($description, ENT_QUOTES, 'UTF-8')) : '';
    $safeNote = ($note !== '') ? nl2br(htmlspecialchars($note, ENT_QUOTES, 'UTF-8')) : '';

    $linkHtml = '';
    if ($appUrl !== '') {
        $safeUrl = htmlspecialchars($appUrl, ENT_QUOTES, 'UTF-8');
        $linkHtml = '<div style="margin-top: 24px; text-align: center;">'
            . '<a href="' . $safeUrl . '" style="background: #2563eb; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-weight: 600; display: inline-block;">Apri su Taskora</a>'
            . '</div>';
    }

    $descHtml = '';
    if ($safeDesc !== '') {
        $descHtml = '<tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600; vertical-align: top;">Descrizione:</td>'
            . '<td style="padding: 8px 12px; color: #1e293b;">' . $safeDesc . '</td></tr>';
    }

    $noteHtml = '';
    if ($safeNote !== '') {
        $noteHtml = '<tr><td style="padding: 8px 12px; color: #64748b; font-weight: 600; vertical-align: top;">Note:</td>'
            . '<td style="padding: 8px 12px; color: #1e293b;">' . $safeNote . '</td></tr>';
    }

    $htmlBody = <<<HTML
<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>{$safeTitle}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px 12px; color: #1e293b;">
  <div style="max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
    <div style="background: #1e293b; color: #ffffff; padding: 18px 24px;">
      <h2 style="margin: 0; font-size: 18px; font-weight: 600; letter-spacing: 0.5px;">Taskora</h2>
    </div>
    <div style="padding: 24px;">
      <p style="font-size: 15px; margin-top: 0; color: #334155;">
        Ciao <strong>{$safeAssignee}</strong>,<br>
        ti è stata assegnata una nuova task da <strong>{$safeAssignedBy}</strong>:
      </p>

      <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 14px 18px; margin: 18px 0; border-radius: 4px;">
        <h3 style="margin: 0; font-size: 16px; color: #0f172a;">{$safeTitle}</h3>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 12px;">
        <tbody>
          <tr>
            <td style="padding: 8px 12px; color: #64748b; font-weight: 600; width: 120px;">Progetto:</td>
            <td style="padding: 8px 12px; color: #1e293b;">{$safeProject}</td>
          </tr>
          <tr style="background: #fbfcfe;">
            <td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Settore:</td>
            <td style="padding: 8px 12px; color: #1e293b;">{$safeSector}</td>
          </tr>
          <tr>
            <td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Priorità:</td>
            <td style="padding: 8px 12px; color: #1e293b;"><strong>{$safePriority}</strong></td>
          </tr>
          <tr style="background: #fbfcfe;">
            <td style="padding: 8px 12px; color: #64748b; font-weight: 600;">Scadenza:</td>
            <td style="padding: 8px 12px; color: #1e293b;">{$safeDueDate}</td>
          </tr>
          {$descHtml}
          {$noteHtml}
        </tbody>
      </table>

      {$linkHtml}
    </div>
    <div style="background: #f8fafc; padding: 12px 24px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
      Questa è una notifica automatica generata da Taskora.
    </div>
  </div>
</body>
</html>
HTML;

    return sendEmail($toEmail, $subject, $htmlBody, $textBody);
}
