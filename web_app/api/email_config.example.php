<?php
// Outgoing email (password resets + hospital crash alerts).
// Copy this file to email_config.php ON THE SERVER and fill in the mailbox
// you created in Hostinger hPanel -> Emails. email_config.php is gitignored
// and blocked from the web by .htaccess; never commit it.

$email_delivery_mode  = "smtp";                 // "smtp" (recommended) or "mail"

// Hostinger SMTP
$smtp_host     = "smtp.hostinger.com";
$smtp_port     = 465;                            // 465 = SSL (recommended), 587 = STARTTLS
$smtp_secure   = "ssl";                          // "ssl" for 465, "tls" for 587
$smtp_username = "no-reply@codingtechnyks.com";  // the full mailbox address
$smtp_password = "PUT-THE-MAILBOX-PASSWORD-HERE";

// What recipients see
$email_sender_name    = "Accidiox";
$email_sender_address = "no-reply@codingtechnyks.com"; // must be the same mailbox

// Public address of the web app, used in password-reset links.
$app_base_url = "https://accidiox.codingtechnyks.com";
