const mongoose = require('mongoose');
const Bus = require('./models/Bus');
require('dotenv').config();

// Realistic Kongu Engineering College bus routes
const newBusesData = [
  {
    busNumber: '03',
    registrationPlate: 'TN-33-AA-1003',
    routeName: 'Tiruppur Express',
    startingPoint: 'Tiruppur Old Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Tiruppur Old Bus Stand', 'Avinashi', 'Perumanallur', 'Kunnathur', 'Perundurai', 'Kongu Engineering College'],
    driverName: 'M. Senthilkumar',
    driverPhone: '+91 94431 10003',
    capacity: 55,
    isActive: true,
  },
  {
    busNumber: '04',
    registrationPlate: 'TN-33-AA-1004',
    routeName: 'Salem Highway Route',
    startingPoint: 'Salem New Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Salem New Bus Stand', 'Kondalampatti', 'Sankari', 'Kumarapalayam', 'Perundurai', 'Kongu Engineering College'],
    driverName: 'P. Murugan',
    driverPhone: '+91 94431 10004',
    capacity: 50,
    isActive: true,
  },
  {
    busNumber: '05',
    registrationPlate: 'TN-33-AA-1005',
    routeName: 'Coimbatore Link Route',
    startingPoint: 'Gandhipuram, Coimbatore',
    destination: 'Kongu Engineering College',
    routeStops: ['Gandhipuram', 'Singanallur', 'Karumathampatti', 'Vijayamangalam', 'Perundurai', 'Kongu Engineering College'],
    driverName: 'K. Ramesh',
    driverPhone: '+91 94431 10005',
    capacity: 55,
    isActive: true,
  },
  {
    busNumber: '06',
    registrationPlate: 'TN-33-AA-1006',
    routeName: 'Gobichettipalayam Line',
    startingPoint: 'Gobi Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Gobi Bus Stand', 'Kallipatti', 'Kunnathur Bypass', 'Perundurai R.S.', 'Kongu Engineering College'],
    driverName: 'R. Natarajan',
    driverPhone: '+91 94431 10006',
    capacity: 45,
    isActive: true,
  },
  {
    busNumber: '07',
    registrationPlate: 'TN-33-AA-1007',
    routeName: 'Bhavani Town Route',
    startingPoint: 'Bhavani Kooduthurai',
    destination: 'Kongu Engineering College',
    routeStops: ['Bhavani Kooduthurai', 'Chithode', 'BP Agraharam', 'Perundurai', 'Kongu Engineering College'],
    driverName: 'S. Balasubramanian',
    driverPhone: '+91 94431 10007',
    capacity: 45,
    isActive: true,
  },
  {
    busNumber: '08',
    registrationPlate: 'TN-33-AA-1008',
    routeName: 'Sathyamangalam Express',
    startingPoint: 'Sathyamangalam Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Sathyamangalam', 'Puliyampatti', 'Nambiyur', 'Kunnathur', 'Kongu Engineering College'],
    driverName: 'A. Palanisamy',
    driverPhone: '+91 94431 10008',
    capacity: 50,
    isActive: true,
  },
  {
    busNumber: '09',
    registrationPlate: 'TN-33-AA-1009',
    routeName: 'Chennimalai Route',
    startingPoint: 'Chennimalai Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Chennimalai Bus Stand', 'Murugampalayam', 'Ingur', 'Perundurai', 'Kongu Engineering College'],
    driverName: 'G. Vijayakumar',
    driverPhone: '+91 94431 10009',
    capacity: 40,
    isActive: true,
  },
  {
    busNumber: '10',
    registrationPlate: 'TN-33-AA-1010',
    routeName: 'Kangeyam Line',
    startingPoint: 'Kangeyam Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Kangeyam Bus Stand', 'Muthur', 'Arachalur', 'Chennimalai', 'Kongu Engineering College'],
    driverName: 'V. Thangavel',
    driverPhone: '+91 94431 10010',
    capacity: 45,
    isActive: true,
  },
  {
    busNumber: '11',
    registrationPlate: 'TN-33-AA-1011',
    routeName: 'Dharapuram Highway',
    startingPoint: 'Dharapuram Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Dharapuram', 'Kundadam', 'Kangeyam', 'Perundurai', 'Kongu Engineering College'],
    driverName: 'M. Krishnan',
    driverPhone: '+91 94431 10011',
    capacity: 50,
    isActive: true,
  },
  {
    busNumber: '12',
    registrationPlate: 'TN-33-AA-1012',
    routeName: 'Anthiyur Junction',
    startingPoint: 'Anthiyur Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Anthiyur', 'Appakudal', 'Bhavani', 'Chithode', 'Kongu Engineering College'],
    driverName: 'T. Selvam',
    driverPhone: '+91 94431 10012',
    capacity: 45,
    isActive: true,
  },
  {
    busNumber: '13',
    registrationPlate: 'TN-33-AA-1013',
    routeName: 'Pallipalayam - Komarapalayam',
    startingPoint: 'Pallipalayam Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Pallipalayam', 'Komarapalayam', 'Bhavani Bypass', 'Perundurai', 'Kongu Engineering College'],
    driverName: 'K. Mohan',
    driverPhone: '+91 94431 10013',
    capacity: 48,
    isActive: true,
  },
  {
    busNumber: '14',
    registrationPlate: 'TN-33-AA-1014',
    routeName: 'Perundurai Local Shuttle',
    startingPoint: 'Perundurai Old Bus Stand',
    destination: 'Kongu Engineering College',
    routeStops: ['Perundurai Old Bus Stand', 'Perundurai Market', 'SIPCOT Industrial Area', 'Kongu Engineering College'],
    driverName: 'C. Dharmaraj',
    driverPhone: '+91 94431 10014',
    capacity: 40,
    isActive: true,
  },
];

async function seedBuses() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    let addedCount = 0;
    let skippedCount = 0;

    for (const bData of newBusesData) {
      // Check if bus with this busNumber already exists to prevent duplicate insertion
      const existing = await Bus.findOne({ busNumber: bData.busNumber });
      if (existing) {
        console.log(`Bus ${bData.busNumber} already exists (${existing.routeName}) - skipping to preserve.`);
        skippedCount++;
      } else {
        await Bus.create(bData);
        console.log(`Added new Bus ${bData.busNumber}: ${bData.routeName} (${bData.registrationPlate})`);
        addedCount++;
      }
    }

    // Ensure initial buses 01 & 02 also have clean starting and destination terminals
    await Bus.updateOne({ busNumber: '01', startingPoint: { $in: ['', null] } }, { $set: { startingPoint: 'Erode Bus Stand', destination: 'Kongu Engineering College' } });
    await Bus.updateOne({ busNumber: '02', startingPoint: { $in: ['', null] } }, { $set: { startingPoint: 'Erode Bus Stand', destination: 'Kongu Engineering College' } });

    const totalBuses = await Bus.countDocuments();
    console.log(`\nBus Seeding Summary: ${addedCount} added, ${skippedCount} skipped. Total buses in fleet: ${totalBuses}`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Error seeding buses:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  seedBuses();
}

module.exports = { newBusesData, seedBuses };
