import ExcelJS from 'exceljs';

/**
 * Creates Excel buffer with user responses
 * @param {Object} data - User data containing username, branch, and answers
 * @param {string} data.username - Telegram username
 * @param {string} data.branch - Selected branch label
 * @param {Array} data.answers - Array of question-answer pairs
 * @returns {Promise<Buffer>} Excel file buffer
 */
export async function createExcel({ username, branch, answers }) {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Результаты');

    // Set column widths for better readability
    ws.getColumn(1).width = 20;
    ws.getColumn(2).width = 50;

    // Add header information
    ws.addRow(['Пользователь (username)', username || 'нет данных']);
    ws.addRow(['Ветка', branch]);
    ws.addRow(['Дата прохождения', new Date().toLocaleString('ru-RU')]);
    ws.addRow([]);

    // Add questions and answers
    answers.forEach((item, idx) => {
      ws.addRow([`Вопрос ${idx + 1}`, item.question]);
      ws.addRow([`Ответ ${idx + 1}`, item.answer]);
      ws.addRow([]);
    });

    // Style the header rows
    ws.getRow(1).font = { bold: true };
    ws.getRow(2).font = { bold: true };
    ws.getRow(3).font = { bold: true };

    return await wb.xlsx.writeBuffer();
  } catch (error) {
    console.error('Error creating Excel file:', error);
    throw new Error('Failed to create Excel file');
  }
}

