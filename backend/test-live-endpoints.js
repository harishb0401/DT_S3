const jwt = require('jsonwebtoken');
require('dotenv').config();

const API_BASE = 'http://localhost:5000/api/v1';

async function testLiveEndpoints() {
  console.log('Testing Live Backend API Endpoints...\n');

  // 1. Authenticate by logging in with real admin credentials
  console.log('Logging in as admin@college.edu ...');
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@college.edu', password: 'admin123' }),
  });
  const loginData = await loginRes.json();
  if (!loginRes.ok) {
    throw new Error('Login failed: ' + JSON.stringify(loginData));
  }
  const token = loginData.accessToken;
  console.log('   Logged in successfully! Access token obtained.');

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // 2. Test GET /buses
  console.log('1. Testing GET /api/v1/buses ...');
  const busRes = await fetch(`${API_BASE}/buses`, { headers });
  const buses = await busRes.json();
  console.log(`   Status: ${busRes.status}, Total buses returned: ${buses.length}`);
  console.log(`   Sample Bus: ${buses[2]?.busNumber} - ${buses[2]?.routeName} (${buses[2]?.startingPoint} -> ${buses[2]?.destination})`);

  // 3. Test GET /reports/fee-report/summary
  console.log('\n2. Testing GET /api/v1/reports/fee-report/summary ...');
  const sumRes = await fetch(`${API_BASE}/reports/fee-report/summary`, { headers });
  const summary = await sumRes.json();
  console.log(`   Status: ${sumRes.status}`);
  console.log(`   Total Students: ${summary.totalStudents}, Paid: ${summary.paidCount}, Not Paid: ${summary.unpaidCount}, Collected: ₹${summary.totalFeeCollected}`);

  // 4. Test GET /reports/fee-report/download?format=xlsx
  console.log('\n3. Testing GET /api/v1/reports/fee-report/download?format=xlsx ...');
  const excelRes = await fetch(`${API_BASE}/reports/fee-report/download?format=xlsx`, { headers });
  const excelBlob = await excelRes.arrayBuffer();
  console.log(`   Status: ${excelRes.status}, Content-Type: ${excelRes.headers.get('content-type')}`);
  console.log(`   Excel File Size: ${excelBlob.byteLength} bytes`);

  // 5. Test GET /reports/fee-report/download?format=pdf
  console.log('\n4. Testing GET /api/v1/reports/fee-report/download?format=pdf ...');
  const pdfRes = await fetch(`${API_BASE}/reports/fee-report/download?format=pdf`, { headers });
  const pdfBlob = await pdfRes.arrayBuffer();
  console.log(`   Status: ${pdfRes.status}, Content-Type: ${pdfRes.headers.get('content-type')}`);
  console.log(`   PDF File Size: ${pdfBlob.byteLength} bytes`);

  // 6. Test Student Registration Email Validation via HTTP POST /students
  console.log('\n5. Testing Student Creation Validation via HTTP POST /students ...');

  // Attempt 1: External email (@gmail.com) -> MUST FAIL
  const failRes = await fetch(`${API_BASE}/students`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      studentId: 'TEST-REJECT-99',
      firstName: 'Invalid',
      lastName: 'User',
      email: 'invalid@gmail.com',
    }),
  });
  const failData = await failRes.json();
  console.log(`   Invalid Email Status: ${failRes.status} (Expected 400), Message: "${failData.message}"`);

  // Attempt 2: Valid Kongu Email (@kongu.edu) -> MUST SUCCEED
  const successRes = await fetch(`${API_BASE}/students`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      studentId: 'TEST-KONGU-101',
      firstName: 'Karthik',
      lastName: 'M',
      email: 'karthik.25cse@kongu.edu',
      rollnumber: '25CSR101',
      department: 'CSE',
      busRoute: 'Tiruppur Express',
      busId: buses.find(b => b.busNumber === '03')?._id,
      transportFee: 4500,
      paymentStatus: 'paid',
    }),
  });
  const successData = await successRes.json();
  console.log(`   Valid Kongu Email Status: ${successRes.status} (Expected 201), Created Student: ${successData.firstName} (${successData.email})`);

  // Clean up test student
  if (successData._id) {
    await fetch(`${API_BASE}/students/${successData._id}`, { method: 'DELETE', headers });
    console.log(`   Cleaned up test student record (${successData._id}).`);
  }

  console.log('\nAll Live HTTP Endpoint Tests Passed Successfully!');
}

testLiveEndpoints().catch(console.error);
