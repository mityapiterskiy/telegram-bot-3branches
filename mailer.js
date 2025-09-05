import nodemailer from 'nodemailer';

/**
 * Sends email with Excel attachment
 * @param {Buffer} buffer - Excel file buffer
 * @param {string} branchName - Branch name for subject
 * @param {string} to - Recipient email address
 */
export async function sendMail(buffer, branchName, to) {
  try {
    // Sanitize env vars (strip accidental newlines/spaces from Vercel env)
    const host = (process.env.SMTP_HOST || 'smtp.yandex.ru').toString().trim();
    const portStr = (process.env.SMTP_PORT || '465').toString().trim();
    const port = Number(portStr);
    const user = (process.env.SMTP_USER || '').toString().trim();
    const pass = (process.env.SMTP_PASS || '').toString().trim();

    let transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass }
    });

    // Verify connection configuration
    await transporter.verify();

    const mailOptions = {
      from: `"Бот диагностики" <${process.env.SMTP_USER}>`,
      to,
      subject: `Ответы пользователя | ${branchName}`,
      text: `Пользователь прошел диагностику по ветке: ${branchName}\n\nВо вложении находится файл с подробными ответами.`,
      html: `
        <h3>Новые результаты диагностики</h3>
        <p><strong>Ветка:</strong> ${branchName}</p>
        <p><strong>Дата:</strong> ${new Date().toLocaleString('ru-RU')}</p>
        <p>Во вложении находится файл Excel с подробными ответами пользователя.</p>
      `,
      attachments: [
        {
          filename: `${branchName.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_')}_${Date.now()}.xlsx`,
          content: Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer),
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        }
      ]
    };

    let result;
    try {
      result = await transporter.sendMail(mailOptions);
    } catch (primaryError) {
      // Retry with STARTTLS on 587 if 465 fails (network/DNS/TLS quirks)
      console.error('Primary SMTP send failed, retrying on 587 STARTTLS:', primaryError?.message);
      transporter = nodemailer.createTransport({
        host,
        port: 587,
        secure: false,
        auth: { user, pass },
        tls: { rejectUnauthorized: true }
      });
      result = await transporter.sendMail(mailOptions);
    }
    console.log('Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

