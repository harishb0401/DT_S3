const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit-table');
const Student = require('../models/Student');
const Bus = require('../models/Bus');
const FeeReceipt = require('../models/FeeReceipt');

/**
 * Fetch and assemble comprehensive live student fee report data
 */
const getFeeReportData = async () => {
  const students = await Student.find({}).populate('busId').sort({ firstName: 1 }).lean();
  const receipts = await FeeReceipt.find({
    status: { $in: ['matched', 'created'] },
  }).sort({ receiptDate: -1, createdAt: -1 }).lean();

  // Map receipts by student ID for fast lookup of payment date & receipt number
  const receiptByStudent = new Map();
  for (const r of receipts) {
    if (r.student) {
      const key = String(r.student);
      if (!receiptByStudent.has(key)) {
        receiptByStudent.set(key, r);
      }
    }
  }

  const paidStudents = [];
  const unpaidStudents = [];

  let totalFeeCollected = 0;
  let outstandingFeeAmount = 0;

  students.forEach((s) => {
    const isPaid = (s.paymentStatus || 'paid').toLowerCase() === 'paid';
    const fee = Number(s.transportFee || 0);

    const linkedReceipt = receiptByStudent.get(String(s._id));
    let paymentDateFormatted = 'N/A';
    if (isPaid) {
      const dateVal = linkedReceipt?.receiptDate || linkedReceipt?.createdAt || s.updatedAt || s.createdAt;
      if (dateVal) {
        paymentDateFormatted = new Date(dateVal).toLocaleDateString('en-IN', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
      }
    }

    const record = {
      _id: s._id,
      studentId: s.studentId || 'N/A',
      name: `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'N/A',
      rollnumber: s.rollnumber || s.studentId || 'N/A',
      department: s.department || 'N/A',
      yearOfStudy: s.batch || s.program || 'N/A',
      section: s.class || 'N/A',
      email: s.email || 'N/A',
      phone: s.phonenumber || s.phone || 'N/A',
      busNumber: s.busId?.busNumber || 'Not Assigned',
      busRoute: s.busRoute || s.busId?.routeName || 'N/A',
      boardingPoint: s.boardingPoint || 'N/A',
      validityPeriod: s.validityPeriod || 'N/A',
      feeAmount: fee,
      paymentStatus: isPaid ? 'Paid' : (s.paymentStatus === 'pending' ? 'Pending' : 'Not Paid'),
      paymentDate: paymentDateFormatted,
      receiptNumber: linkedReceipt?.receiptNumber || 'N/A',
    };

    if (isPaid) {
      paidStudents.push(record);
      totalFeeCollected += fee;
    } else {
      unpaidStudents.push(record);
      outstandingFeeAmount += fee;
    }
  });

  const totalStudents = students.length;
  const paidCount = paidStudents.length;
  const unpaidCount = unpaidStudents.length;
  const totalExpectedFee = totalFeeCollected + outstandingFeeAmount;
  const collectionRate = totalExpectedFee > 0 ? ((totalFeeCollected / totalExpectedFee) * 100).toFixed(1) : 0;

  return {
    generatedAt: new Date(),
    generatedAtFormatted: new Date().toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }),
    totalStudents,
    paidCount,
    unpaidCount,
    totalFeeCollected,
    outstandingFeeAmount,
    collectionRate,
    paidStudents,
    unpaidStudents,
  };
};

/**
 * Generate Excel (.xlsx) Report with Summary, Paid Students, and Not Paid Students sheets
 */
const generateExcelReport = async () => {
  const data = await getFeeReportData();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Kongu Engineering College Transport Department';
  workbook.created = data.generatedAt;

  // -------------------------------------------------------------
  // Sheet 1: Summary & Overview
  // -------------------------------------------------------------
  const summarySheet = workbook.addWorksheet('Summary Overview', {
    views: [{ showGridLines: true }],
  });

  summarySheet.columns = [
    { width: 5 },
    { width: 35 },
    { width: 25 },
    { width: 5 },
  ];

  summarySheet.mergeCells('B2:C2');
  const titleCell = summarySheet.getCell('B2');
  titleCell.value = 'KONGU ENGINEERING COLLEGE (AUTONOMOUS)';
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: 'FFFFFFFF' } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  summarySheet.getRow(2).height = 30;

  summarySheet.mergeCells('B3:C3');
  const subtitleCell = summarySheet.getCell('B3');
  subtitleCell.value = 'TRANSPORT DEPARTMENT · BUS FEE PAYMENT REPORT';
  subtitleCell.font = { name: 'Calibri', size: 12, bold: true, color: { argb: 'FFFFFFFF' } };
  subtitleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  subtitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
  summarySheet.getRow(3).height = 24;

  summarySheet.mergeCells('B4:C4');
  const genCell = summarySheet.getCell('B4');
  genCell.value = `Report Generated On: ${data.generatedAtFormatted}`;
  genCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
  genCell.alignment = { horizontal: 'center', vertical: 'middle' };
  summarySheet.getRow(4).height = 20;

  // Metrics Table
  const metrics = [
    ['Total Registered Students', data.totalStudents],
    ['Students Who Have Paid', data.paidCount],
    ['Students Who Have Not Paid / Pending', data.unpaidCount],
    ['Total Fee Collected (₹)', `₹ ${data.totalFeeCollected.toLocaleString('en-IN')}`],
    ['Outstanding Fee Amount (₹)', `₹ ${data.outstandingFeeAmount.toLocaleString('en-IN')}`],
    ['Collection Compliance Rate', `${data.collectionRate}%`],
  ];

  summarySheet.getCell('B6').value = 'Metric Description';
  summarySheet.getCell('C6').value = 'Value';
  ['B6', 'C6'].forEach((cellId) => {
    const c = summarySheet.getCell(cellId);
    c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
    c.alignment = { vertical: 'middle', horizontal: cellId === 'C6' ? 'center' : 'left' };
  });
  summarySheet.getRow(6).height = 24;

  metrics.forEach((m, idx) => {
    const rIdx = 7 + idx;
    const labelCell = summarySheet.getCell(`B${rIdx}`);
    const valCell = summarySheet.getCell(`C${rIdx}`);

    labelCell.value = m[0];
    valCell.value = m[1];

    labelCell.font = { name: 'Calibri', size: 11, bold: idx >= 3 };
    valCell.font = { name: 'Calibri', size: 11, bold: true };

    const bg = rIdx % 2 === 0 ? 'FFF8FAFC' : 'FFFFFFFF';
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    valCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };

    if (m[0].includes('Paid Students')) valCell.font = { color: { argb: 'FF059669' }, bold: true };
    if (m[0].includes('Not Paid')) valCell.font = { color: { argb: 'FFDC2626' }, bold: true };
    if (m[0].includes('Collected')) valCell.font = { color: { argb: 'FF059669' }, bold: true };
    if (m[0].includes('Outstanding')) valCell.font = { color: { argb: 'FFDC2626' }, bold: true };

    valCell.alignment = { horizontal: 'center', vertical: 'middle' };
    labelCell.alignment = { vertical: 'middle' };

    summarySheet.getRow(rIdx).height = 22;
  });

  // Helper function to build student table sheets
  const buildStudentSheet = (sheetName, titleText, titleBg, headerBg, studentList, isPaidSheet) => {
    const sheet = workbook.addWorksheet(sheetName, {
      views: [{ showGridLines: true }],
    });

    sheet.columns = [
      { header: 'S.No', key: 'sno', width: 8 },
      { header: 'Student ID', key: 'studentId', width: 16 },
      { header: 'Student Name', key: 'name', width: 24 },
      { header: 'Register No', key: 'rollnumber', width: 16 },
      { header: 'Department', key: 'department', width: 16 },
      { header: 'Year / Batch', key: 'yearOfStudy', width: 14 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'Kongu Email ID', key: 'email', width: 32 },
      { header: 'Phone Number', key: 'phone', width: 16 },
      { header: 'Bus No', key: 'busNumber', width: 12 },
      { header: 'Bus Route', key: 'busRoute', width: 26 },
      { header: 'Boarding Point', key: 'boardingPoint', width: 20 },
      { header: 'Fee (₹)', key: 'feeAmount', width: 14 },
      { header: 'Payment Status', key: 'paymentStatus', width: 16 },
      { header: isPaidSheet ? 'Payment Date' : 'Due Status', key: 'paymentDate', width: 16 },
    ];

    // Insert Title Rows
    sheet.spliceRows(1, 0,
      [`KONGU ENGINEERING COLLEGE — ${titleText}`],
      [`Report Generated: ${data.generatedAtFormatted} · Total Records: ${studentList.length}`],
      []
    );

    sheet.mergeCells('A1:O1');
    const tCell = sheet.getCell('A1');
    tCell.font = { name: 'Calibri', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    tCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: titleBg } };
    tCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(1).height = 28;

    sheet.mergeCells('A2:O2');
    const subCell = sheet.getCell('A2');
    subCell.font = { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } };
    subCell.alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(2).height = 18;

    // Header Row is now Row 4
    const headerRow = sheet.getRow(4);
    headerRow.height = 26;
    headerRow.eachCell((cell) => {
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: headerBg } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
      };
    });

    let subtotalFee = 0;

    studentList.forEach((s, idx) => {
      subtotalFee += s.feeAmount;
      const row = sheet.addRow({
        sno: idx + 1,
        studentId: s.studentId,
        name: s.name,
        rollnumber: s.rollnumber,
        department: s.department,
        yearOfStudy: s.yearOfStudy,
        section: s.section,
        email: s.email,
        phone: s.phone,
        busNumber: s.busNumber,
        busRoute: s.busRoute,
        boardingPoint: s.boardingPoint,
        feeAmount: s.feeAmount,
        paymentStatus: s.paymentStatus,
        paymentDate: isPaidSheet ? s.paymentDate : 'Pending Collection',
      });

      row.height = 20;
      const isEven = idx % 2 === 0;
      const rowBg = isEven ? 'FFFFFFFF' : 'FFF8FAFC';

      row.eachCell((cell, colNumber) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: rowBg } };
        cell.font = { name: 'Calibri', size: 10 };
        cell.border = {
          bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        };
        // Alignments
        if ([1, 2, 4, 6, 7, 9, 10, 14, 15].includes(colNumber)) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
        } else if (colNumber === 13) {
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
          cell.numFmt = '₹#,##0';
        } else {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        }

        // Highlight payment status
        if (colNumber === 14) {
          cell.font = {
            name: 'Calibri',
            size: 10,
            bold: true,
            color: { argb: isPaidSheet ? 'FF059669' : 'FFDC2626' },
          };
        }
      });
    });

    // Total Row
    const totalRow = sheet.addRow({
      sno: '',
      studentId: '',
      name: `Total (${studentList.length} Students)`,
      rollnumber: '',
      department: '',
      yearOfStudy: '',
      section: '',
      email: '',
      phone: '',
      busNumber: '',
      busRoute: '',
      boardingPoint: '',
      feeAmount: subtotalFee,
      paymentStatus: isPaidSheet ? 'Total Collected' : 'Total Outstanding',
      paymentDate: '',
    });

    totalRow.height = 24;
    totalRow.eachCell((cell, colNumber) => {
      cell.font = { name: 'Calibri', size: 11, bold: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        bottom: { style: 'double', color: { argb: 'FF000000' } },
      };
      if (colNumber === 13) {
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
        cell.numFmt = '₹#,##0';
      }
    });
  };

  // Build Sheet 2: Paid Students (Green theme)
  buildStudentSheet(
    'Paid Students',
    'STUDENTS WHO HAVE PAID',
    'FF065F46', // Deep Emerald
    'FF047857',
    data.paidStudents,
    true
  );

  // Build Sheet 3: Not Paid Students (Red theme)
  buildStudentSheet(
    'Not Paid Students',
    'STUDENTS WHO HAVE NOT PAID (PENDING)',
    'FF991B1B', // Deep Crimson
    'FFB91C1C',
    data.unpaidStudents,
    false
  );

  return workbook;
};

/**
 * Generate PDF Report with Landscape orientation and clear Paid / Not Paid sections
 */
const generatePdfReport = async () => {
  const data = await getFeeReportData();

  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({
        margin: 30,
        size: 'A4',
        layout: 'landscape', // 841.89 x 595.28 pt
        bufferPages: true,
      });

      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });

      // -------------------------------------------------------------
      // Header Section
      // -------------------------------------------------------------
      doc.rect(30, 25, 781, 55).fill('#1E3A8A');
      doc.fillColor('#FFFFFF').fontSize(16).font('Helvetica-Bold')
        .text('KONGU ENGINEERING COLLEGE (AUTONOMOUS)', 30, 35, { align: 'center', width: 781 });
      doc.fontSize(11).font('Helvetica')
        .text('TRANSPORT DEPARTMENT · STUDENT BUS FEE COMPREHENSIVE REPORT', 30, 56, { align: 'center', width: 781 });

      doc.moveDown(2);

      // Metadata & Generation Info
      doc.fillColor('#334155').fontSize(9).font('Helvetica')
        .text(`Report Generation Date & Time: ${data.generatedAtFormatted}`, 35, 90);
      doc.text(`Total Fleet Students: ${data.totalStudents}  |  Paid: ${data.paidCount}  |  Not Paid / Pending: ${data.unpaidCount}`, 35, 104);

      // Summary KPI Box
      doc.rect(30, 120, 781, 48).fill('#F1F5F9');
      doc.rect(30, 120, 781, 48).stroke('#CBD5E1');

      doc.fillColor('#1E293B').fontSize(9).font('Helvetica-Bold');
      doc.text('Total Students', 45, 126, { width: 140, align: 'center' });
      doc.text('Paid Students', 195, 126, { width: 140, align: 'center' });
      doc.text('Not Paid / Pending', 345, 126, { width: 140, align: 'center' });
      doc.text('Total Fee Collected', 495, 126, { width: 140, align: 'center' });
      doc.text('Outstanding Amount', 645, 126, { width: 140, align: 'center' });

      doc.fontSize(13);
      doc.fillColor('#0F172A').text(String(data.totalStudents), 45, 142, { width: 140, align: 'center' });
      doc.fillColor('#059669').text(String(data.paidCount), 195, 142, { width: 140, align: 'center' });
      doc.fillColor('#DC2626').text(String(data.unpaidCount), 345, 142, { width: 140, align: 'center' });
      doc.fillColor('#059669').text(`Rs. ${data.totalFeeCollected.toLocaleString('en-IN')}`, 495, 142, { width: 140, align: 'center' });
      doc.fillColor('#DC2626').text(`Rs. ${data.outstandingFeeAmount.toLocaleString('en-IN')}`, 645, 142, { width: 140, align: 'center' });

      doc.y = 180;

      // -------------------------------------------------------------
      // Category A Table: Students Who Have Paid
      // -------------------------------------------------------------
      const paidRows = data.paidStudents.map((s, idx) => [
        String(idx + 1),
        s.studentId,
        s.name,
        s.rollnumber,
        s.department,
        s.email,
        s.phone,
        s.busNumber,
        s.busRoute,
        `Rs. ${s.feeAmount.toLocaleString('en-IN')}`,
        'Paid',
        s.paymentDate,
      ]);

      const paidTable = {
        title: 'SECTION A: STUDENTS WHO HAVE PAID (BOARDING ALLOWED)',
        subtitle: `Total Paid: ${data.paidCount} Students  ·  Fee Collected: Rs. ${data.totalFeeCollected.toLocaleString('en-IN')}`,
        headers: [
          { label: 'S.No', width: 30 },
          { label: 'ID', width: 65 },
          { label: 'Name', width: 95 },
          { label: 'Roll No', width: 65 },
          { label: 'Dept', width: 50 },
          { label: 'Kongu Institutional Email', width: 135 },
          { label: 'Phone', width: 70 },
          { label: 'Bus', width: 40 },
          { label: 'Route', width: 85 },
          { label: 'Fee', width: 55 },
          { label: 'Status', width: 45 },
          { label: 'Paid Date', width: 46 },
        ],
        rows: paidRows.length ? paidRows : [['—', '—', 'No paid students found', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
      };

      await doc.table(paidTable, {
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF'),
        prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
          doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B');
        },
        divider: {
          header: { disabled: false, width: 1, opacity: 1 },
          horizontal: { disabled: false, width: 0.5, opacity: 0.3 },
        },
      });

      // -------------------------------------------------------------
      // Category B Table: Students Who Have Not Paid
      // -------------------------------------------------------------
      doc.addPage();

      const unpaidRows = data.unpaidStudents.map((s, idx) => [
        String(idx + 1),
        s.studentId,
        s.name,
        s.rollnumber,
        s.department,
        s.email,
        s.phone,
        s.busNumber,
        s.busRoute,
        `Rs. ${s.feeAmount.toLocaleString('en-IN')}`,
        s.paymentStatus,
        'Pending',
      ]);

      const unpaidTable = {
        title: 'SECTION B: STUDENTS WHO HAVE NOT PAID / PENDING',
        subtitle: `Total Outstanding: ${data.unpaidCount} Students  ·  Outstanding Balance: Rs. ${data.outstandingFeeAmount.toLocaleString('en-IN')}`,
        headers: [
          { label: 'S.No', width: 30 },
          { label: 'ID', width: 65 },
          { label: 'Name', width: 95 },
          { label: 'Roll No', width: 65 },
          { label: 'Dept', width: 50 },
          { label: 'Kongu Institutional Email', width: 135 },
          { label: 'Phone', width: 70 },
          { label: 'Bus', width: 40 },
          { label: 'Route', width: 85 },
          { label: 'Fee', width: 55 },
          { label: 'Status', width: 45 },
          { label: 'Action Due', width: 46 },
        ],
        rows: unpaidRows.length ? unpaidRows : [['—', '—', 'No unpaid students found', '—', '—', '—', '—', '—', '—', '—', '—', '—']],
      };

      await doc.table(unpaidTable, {
        prepareHeader: () => doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF'),
        prepareRow: (row, indexColumn, indexRow, rectRow, rectCell) => {
          doc.font('Helvetica').fontSize(7.5).fillColor('#1E293B');
        },
        divider: {
          header: { disabled: false, width: 1, opacity: 1 },
          horizontal: { disabled: false, width: 0.5, opacity: 0.3 },
        },
      });

      // Page numbering footer
      const pages = doc.bufferedPageRange();
      for (let i = 0; i < pages.count; i++) {
        doc.switchToPage(i);
        doc.fillColor('#94A3B8').fontSize(8).font('Helvetica')
          .text(
            `Kongu Engineering College (Autonomous) · Confidential Student Fee Report · Page ${i + 1} of ${pages.count}`,
            30,
            575,
            { align: 'center', width: 781 }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  getFeeReportData,
  generateExcelReport,
  generatePdfReport,
};
