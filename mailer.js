import nodemailer from 'nodemailer';

/**
 * Sends email with Excel attachment
 * @param {Buffer} buffer - Excel file buffer
 * @param {string} branchName - Branch name for subject
 * @param {string} to - Recipient email address
 */
export async function sendMail(buffer, branchName, to) {
  try {
    const transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.yandex.ru',
      port: Number(process.env.SMTP_PORT || 465),
      secure: true, // Use SSL for Yandex
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
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
          content: buffer
        }
      ]
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

