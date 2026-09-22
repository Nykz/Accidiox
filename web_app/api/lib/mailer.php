<?php
// Minimal SMTP mailer (no Composer needed). Configured by ../email_config.php:
//   $email_delivery_mode = "smtp";
//   $smtp_host = "smtp.hostinger.com"; $smtp_port = 465; $smtp_secure = "ssl";
//   $smtp_username = "no-reply@yourdomain.com"; $smtp_password = "...";
//   $email_sender_name = "Accidiox"; $email_sender_address = "no-reply@yourdomain.com";
//   $app_base_url = "https://accidiox.yourdomain.com";
// Falls back to PHP mail() when mode is "mail".

function mail_config() {
    static $cfg = null;
    if ($cfg !== null) return $cfg;
    $file = __DIR__ . '/../email_config.php';
    if (file_exists($file)) include $file;
    $cfg = [
        "mode" => $email_delivery_mode ?? "mail",
        "host" => $smtp_host ?? "smtp.hostinger.com",
        "port" => (int) ($smtp_port ?? 465),
        "secure" => strtolower($smtp_secure ?? "ssl"),
        "username" => $smtp_username ?? "",
        "password" => $smtp_password ?? "",
        "from_name" => $email_sender_name ?? "Accidiox",
        "from_email" => $email_sender_address ?? ($smtp_username ?? ""),
        "base_url" => rtrim($app_base_url ?? "", "/"),
    ];
    return $cfg;
}

// Public URL of the web app, for links in emails. Uses the configured
// value; never trusts the request's Host header (link-poisoning attacks).
function app_base_url() {
    $cfg = mail_config();
    if ($cfg['base_url']) return $cfg['base_url'];
    $host = $_SERVER['SERVER_NAME'] ?? 'localhost';
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $dir = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/api/x.php'))), '/');
    return "$https://$host$dir";
}

function mail_header_safe($s) {
    return trim(preg_replace('/[\r\n]+/', ' ', (string) $s));
}

function mail_encode_header($s) {
    $s = mail_header_safe($s);
    return preg_match('/[^\x20-\x7E]/', $s) ? '=?UTF-8?B?' . base64_encode($s) . '?=' : $s;
}

// Returns ["ok" => bool, "detail" => string].
function send_mail($to, $subject, $html, $text = null) {
    $to = mail_header_safe($to);
    if (!filter_var($to, FILTER_VALIDATE_EMAIL)) return ["ok" => false, "detail" => "invalid recipient"];
    $cfg = mail_config();
    $text = $text ?? trim(html_entity_decode(strip_tags(preg_replace('/<br\s*\/?>|<\/p>|<\/tr>/i', "\n", $html)), ENT_QUOTES, 'UTF-8'));

    $boundary = 'b' . bin2hex(random_bytes(12));
    $fromEmail = mail_header_safe($cfg['from_email']);
    $domain = substr(strrchr($fromEmail, '@') ?: '@localhost', 1);
    $headers = [
        "Date: " . date('r'),
        "From: " . mail_encode_header($cfg['from_name']) . " <$fromEmail>",
        "To: <$to>",
        "Subject: " . mail_encode_header($subject),
        "Message-ID: <" . bin2hex(random_bytes(16)) . "@$domain>",
        "MIME-Version: 1.0",
        "Content-Type: multipart/alternative; boundary=\"$boundary\"",
    ];
    $body = "--$boundary\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
          . chunk_split(base64_encode($text))
          . "--$boundary\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
          . chunk_split(base64_encode($html))
          . "--$boundary--\r\n";

    if ($cfg['mode'] !== 'smtp' || !$cfg['username'] || !$cfg['password']) {
        $extra = implode("\r\n", array_filter($headers, fn($h) => !preg_match('/^(To|Subject):/', $h)));
        $ok = @mail($to, mail_encode_header($subject), $body, $extra);
        return ["ok" => (bool) $ok, "detail" => $ok ? "sent via mail()" : "mail() failed"];
    }
    return smtp_send($cfg, $to, implode("\r\n", $headers) . "\r\n\r\n" . $body);
}

function smtp_send($cfg, $to, $message) {
    $ctx = stream_context_create(["ssl" => ["verify_peer" => true, "verify_peer_name" => true, "peer_name" => $cfg['host']]]);
    $remote = ($cfg['secure'] === 'ssl' ? "ssl://" : "tcp://") . $cfg['host'] . ":" . $cfg['port'];
    $fp = @stream_socket_client($remote, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) return ["ok" => false, "detail" => "connect failed: $errstr"];
    stream_set_timeout($fp, 15);

    $read = function () use ($fp) {
        $data = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $data .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') break;
        }
        return $data;
    };
    $cmd = function ($line, $expect) use ($fp, $read) {
        if ($line !== null) fwrite($fp, $line . "\r\n");
        $resp = $read();
        if ((int) substr($resp, 0, 3) !== $expect) throw new RuntimeException(trim($resp) ?: "no response");
        return $resp;
    };

    try {
        $cmd(null, 220);
        $helo = preg_replace('/[^a-z0-9.-]/i', '', $_SERVER['SERVER_NAME'] ?? 'localhost') ?: 'localhost';
        $cmd("EHLO $helo", 250);
        if ($cfg['secure'] === 'tls') {
            $cmd("STARTTLS", 220);
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) throw new RuntimeException("TLS failed");
            $cmd("EHLO $helo", 250);
        }
        $cmd("AUTH LOGIN", 334);
        $cmd(base64_encode($cfg['username']), 334);
        $cmd(base64_encode($cfg['password']), 235);
        $cmd("MAIL FROM:<" . mail_header_safe($cfg['from_email'] ?: $cfg['username']) . ">", 250);
        $cmd("RCPT TO:<$to>", 250);
        $cmd("DATA", 354);
        // Dot-stuffing per RFC 5321.
        $cmd(preg_replace('/^\./m', '..', str_replace("\n", "\r\n", str_replace("\r\n", "\n", $message))) . "\r\n.", 250);
        fwrite($fp, "QUIT\r\n");
        fclose($fp);
        return ["ok" => true, "detail" => "sent"];
    } catch (RuntimeException $e) {
        @fclose($fp);
        error_log("[Accidiox mail] " . $e->getMessage());
        return ["ok" => false, "detail" => "smtp error"];
    }
}

// Branded, email-client-safe layout (tables + inline styles).
function email_layout($title, $bodyHtml, $buttonText = null, $buttonUrl = null) {
    $t = htmlspecialchars($title, ENT_QUOTES, 'UTF-8');
    $btn = $buttonText && $buttonUrl
        ? '<tr><td style="padding:8px 32px 28px"><a href="' . htmlspecialchars($buttonUrl, ENT_QUOTES, 'UTF-8') . '" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:700;padding:13px 22px;border-radius:10px;font-size:15px">' . htmlspecialchars($buttonText, ENT_QUOTES, 'UTF-8') . '</a></td></tr>'
        : '';
    return '<!DOCTYPE html><html><body style="margin:0;background:#f1f2f5;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#14161a">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f2f5;padding:24px 12px"><tr><td align="center">'
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:16px;border:1px solid #e3e5e9">'
        . '<tr><td style="padding:28px 32px 8px"><div style="font-size:18px;font-weight:800;color:#e5484d">Accidiox</div>'
        . '<h1 style="font-size:22px;margin:18px 0 6px">' . $t . '</h1></td></tr>'
        . '<tr><td style="padding:0 32px 16px;font-size:15px;line-height:1.55;color:#3f444d">' . $bodyHtml . '</td></tr>'
        . $btn
        . '<tr><td style="padding:16px 32px 24px;font-size:12px;color:#9297a1;border-top:1px solid #edeef1">This is an automated message from Accidiox. Please do not reply.</td></tr>'
        . '</table></td></tr></table></body></html>';
}
