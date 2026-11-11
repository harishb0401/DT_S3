const mongoose = require('mongoose');
const Bus = require('./models/Bus');
const Student = require('./models/Student');
const TravelRecord = require('./models/TravelRecord');
const UnpaidTravel = require('./models/UnpaidTravel');
const { validateKonguEmail } = require('./utils/emailValidator');
const feeReportService = require('./services/feeReport.service');
const faceLockService = require('./services/faceLock.service');
require('dotenv').config();

const runAllTests = async () => {
  console.log('================================================================');
  console.log('STARTING ENHANCEMENT VERIFICATION TEST SUITE');
  console.log('================================================================\n');

  await mongoose.connect(process.env.MONGODB_URI);
  let passed = 0;
  let failed = 0;

  const assert = (condition, testName, details = '') => {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}: ${details}`);
      failed++;
    }
  };

  try {
    // -------------------------------------------------------------
    // TEST SUITE 1: BUS MANAGEMENT (Requirement 1)
    // -------------------------------------------------------------
    console.log('\n--- 1. BUS MANAGEMENT TESTS ---');
    const buses = await Bus.find({}).sort({ busNumber: 1 });
    assert(buses.length >= 12, `Total buses count (${buses.length}) is >= 12`);

    const bus01 = buses.find((b) => b.busNumber === '01');
    const bus02 = buses.find((b) => b.busNumber === '02');
    assert(!!bus01 && !!bus02, 'Existing buses 01 & 02 are preserved intact');

    const bus03 = buses.find((b) => b.busNumber === '03');
    assert(
      bus03 &&
      bus03.registrationPlate === 'TN-33-AA-1003' &&
      bus03.routeName === 'Tiruppur Express' &&
      bus03.startingPoint === 'Tiruppur Old Bus Stand' &&
      bus03.destination === 'Kongu Engineering College' &&
      bus03.capacity === 55,
      'New Bus 03 has complete route, terminals, driver and capacity info'
    );

    const bus14 = buses.find((b) => b.busNumber === '14');
    assert(
      bus14 && bus14.routeName === 'Perundurai Local Shuttle',
      'New Bus 14 (Perundurai Local Shuttle) exists in database'
    );

    // Test student assignment to new bus
    const testStudent = await Student.findOne({});
    if (testStudent && bus03) {
      const originalBusId = testStudent.busId;
      testStudent.busId = bus03._id;
      testStudent.busRoute = bus03.routeName;
      await testStudent.save();

      await Bus.findByIdAndUpdate(bus03._id, { $addToSet: { assignedStudents: testStudent._id } });
      const updatedBus03 = await Bus.findById(bus03._id);
      assert(
        updatedBus03.assignedStudents.some((id) => String(id) === String(testStudent._id)),
        'Student assignment to new Bus 03 functions correctly'
      );

      // Revert test student assignment
      testStudent.busId = originalBusId;
      await testStudent.save();
      await Bus.findByIdAndUpdate(bus03._id, { $pull: { assignedStudents: testStudent._id } });
    }

    // -------------------------------------------------------------
    // TEST SUITE 2: KONGU INSTITUTIONAL EMAIL VALIDATION (Requirement 4)
    // -------------------------------------------------------------
    console.log('\n--- 2. KONGU INSTITUTIONAL EMAIL VALIDATION TESTS ---');

    // Valid @kongu.edu
    const valid1 = validateKonguEmail('student.25cse@kongu.edu');
    assert(valid1.isValid && valid1.normalizedEmail === 'student.25cse@kongu.edu', 'Valid @kongu.edu email accepted');

    // Valid @kongu.ac.in
    const valid2 = validateKonguEmail('faculty@kongu.ac.in');
    assert(valid2.isValid && valid2.normalizedEmail === 'faculty@kongu.ac.in', 'Valid @kongu.ac.in email accepted');

    // Missing email
    const invalidEmpty = validateKonguEmail('');
    assert(!invalidEmpty.isValid, 'Empty email is correctly rejected');

    // Invalid format
    const invalidFormat = validateKonguEmail('not-an-email');
    assert(!invalidFormat.isValid, 'Malformed email string is correctly rejected');

    // External domain (@gmail.com)
    const invalidDomain = validateKonguEmail('student@gmail.com');
    assert(
      !invalidDomain.isValid && invalidDomain.error.includes('Kongu institutional domain'),
      'External email (@gmail.com) is correctly rejected with institutional domain warning'
    );

    // Case-insensitivity
    const caseCheck = validateKonguEmail('STUDENT.TEST@KONGU.EDU');
    assert(caseCheck.isValid && caseCheck.normalizedEmail === 'student.test@kongu.edu', 'Email normalized to lowercase');

    // -------------------------------------------------------------
    // TEST SUITE 3: DOWNLOADABLE FEE REPORTS (Requirement 2)
    // -------------------------------------------------------------
    console.log('\n--- 3. DOWNLOADABLE FEE REPORT TESTS ---');

    const reportData = await feeReportService.getFeeReportData();
    assert(reportData.totalStudents >= 4, `Report retrieves all students (found: ${reportData.totalStudents})`);
    assert(typeof reportData.totalFeeCollected === 'number', `Fee collected calculation is valid: ₹${reportData.totalFeeCollected}`);
    assert(Array.isArray(reportData.paidStudents), 'Paid students category is separated into array');
    assert(Array.isArray(reportData.unpaidStudents), 'Not Paid students category is separated into array');
    assert(
      reportData.totalStudents === reportData.paidCount + reportData.unpaidCount,
      'Total students count equals Paid Count + Unpaid Count'
    );

    // Test Excel workbook generation
    const workbook = await feeReportService.generateExcelReport();
    assert(workbook && workbook.worksheets.length === 3, 'Excel workbook generated with 3 distinct sheets (Summary, Paid, Not Paid)');
    const sheetNames = workbook.worksheets.map((ws) => ws.name);
    assert(
      sheetNames.includes('Summary Overview') &&
      sheetNames.includes('Paid Students') &&
      sheetNames.includes('Not Paid Students'),
      'Excel contains Summary Overview, Paid Students, and Not Paid Students sheets'
    );

    // Test PDF generation
    const pdfBuffer = await feeReportService.generatePdfReport();
    assert(
      Buffer.isBuffer(pdfBuffer) && pdfBuffer.length > 1000,
      `PDF binary generated successfully (size: ${pdfBuffer.length} bytes)`
    );
    const pdfHeader = pdfBuffer.slice(0, 4).toString();
    assert(pdfHeader === '%PDF', 'PDF buffer contains valid %PDF magic header');

    // -------------------------------------------------------------
    // TEST SUITE 4: DUPLICATE FACE RECOGNITION PREVENTION (Requirement 3)
    // -------------------------------------------------------------
    console.log('\n--- 4. DUPLICATE FACE RECOGNITION PREVENTION TESTS ---');

    const studentAId = new mongoose.Types.ObjectId();
    const studentBId = new mongoose.Types.ObjectId();
    const testBusId = bus01._id;

    // Test 1: First appearance of Student A -> Not duplicate
    const check1 = await faceLockService.checkStudentPresenceLock(studentAId, testBusId);
    assert(!check1.isDuplicate, 'Student A initial detection is marked as NOT duplicate');

    // Simulate recording Student A boarding
    const fakeTravelIdA = new mongoose.Types.ObjectId();
    faceLockService.recordStudentLock(studentAId, testBusId, fakeTravelIdA, 'paid');

    // Test 2: Student A remains continuously in frame (immediate second scan) -> MUST BE DUPLICATE
    const check2 = await faceLockService.checkStudentPresenceLock(studentAId, testBusId);
    assert(
      check2.isDuplicate && check2.reason === 'continuous_presence',
      'Student A continuous appearance is detected as duplicate and blocked'
    );

    // Test 3: Student B appears -> MUST NOT BE BLOCKED by Student A!
    const checkB = await faceLockService.checkStudentPresenceLock(studentBId, testBusId);
    assert(!checkB.isDuplicate, 'Student B can be recognized independently while Student A is locked');

    // Test 4: Concurrency mutex (in-flight locks)
    const acquired1 = faceLockService.acquireInFlight(studentAId);
    assert(acquired1, 'In-flight mutex acquired for student');
    const acquired2 = faceLockService.acquireInFlight(studentAId);
    assert(!acquired2, 'Simultaneous second request is blocked by in-flight mutex');
    faceLockService.releaseInFlight(studentAId);
    const acquired3 = faceLockService.acquireInFlight(studentAId);
    assert(acquired3, 'In-flight mutex properly released and re-acquirable');
    faceLockService.releaseInFlight(studentAId);

    // Test 5: Student A leaves the camera frame (disappearance)
    // Fast-forward lastSeenAt beyond disappearanceTimeout
    const sessionA = faceLockService.activeLocks.get(String(studentAId));
    if (sessionA) {
      sessionA.lastSeenAt = Date.now() - (faceLockService.disappearanceTimeoutMs + 1000);
      sessionA.lastRecordedAt = Date.now() - (faceLockService.cooldownMs + 1000);
    }
    const checkAfterDeparture = await faceLockService.checkStudentPresenceLock(studentAId, testBusId);
    assert(
      !checkAfterDeparture.isDuplicate,
      'Lock released after student disappeared for required duration and cooldown elapsed'
    );

    // Clean up test locks
    faceLockService.releaseLock(studentAId);
    faceLockService.releaseLock(studentBId);

    console.log('\n================================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================\n');

    await mongoose.disconnect();
    if (failed > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  } catch (err) {
    console.error('Test Suite Exception:', err);
    await mongoose.disconnect();
    process.exit(1);
  }
};

runAllTests();

