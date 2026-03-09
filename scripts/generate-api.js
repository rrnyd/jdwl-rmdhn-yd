const fs = require('fs');
const path = require('path');

// Baca index.html
const indexPath = path.join(__dirname, '..', 'index.html');
const htmlContent = fs.readFileSync(indexPath, 'utf-8');

// Extract scheduleData - handle JavaScript object format (bukan JSON)
const scheduleMatch = htmlContent.match(/const scheduleData = (\[[\s\S]*?\]);/);
if (!scheduleMatch) {
    console.error('Tidak dapat menemukan scheduleData');
    process.exit(1);
}

// Convert JavaScript object ke JSON valid
let jsObject = scheduleMatch[1]
    // Tambahkan quotes ke property names yang tidak pakai
    .replace(/(\s+)([a-zA-Z_]+):/g, '$1"$2":')
    // Fix single quotes jika ada
    .replace(/'/g, '"');

// Fix trailing commas
jsObject = jsObject.replace(/,(\s*[\]}])/g, '$1');

let scheduleData;
try {
    scheduleData = JSON.parse(jsObject);
} catch (e) {
    console.error('Gagal parse:', e.message);
    console.log('Konten yang dicoba diparse (first 500 chars):');
    console.log(jsObject.substring(0, 500));
    process.exit(1);
}

// Helper functions
function timeToMinutes(time) {
    const [h, m] = time.split(':').map(Number);
    return h * 60 + m;
}

function to12Hour(time24) {
    const [hours, minutes] = time24.split(':').map(Number);
    const period = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, '0')} ${period}`;
}

function formatCountdown(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Get current time (WIB = UTC+7)
const now = new Date();
const wibTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
const currentMin = wibTime.getUTCHours() * 60 + wibTime.getUTCMinutes();
const currentSec = wibTime.getUTCSeconds();

// Cari data hari ini
const todayDay = wibTime.getUTCDate();
const todayMonth = wibTime.getUTCMonth();
const todayYear = wibTime.getUTCFullYear();

let todayIndex = scheduleData.findIndex(d => {
    const dayNum = parseInt(d.date.split(' ')[0]);
    return dayNum === todayDay && todayMonth === 1 && todayYear === 2026;
});

if (todayIndex === -1) todayIndex = 0;

const todayData = scheduleData[todayIndex] || scheduleData[0];
const tomorrowData = scheduleData[todayIndex + 1] || null;

// Hitung status
const imsakMin = timeToMinutes(todayData.imsak);
const maghribMin = timeToMinutes(todayData.maghrib);
const isyaMin = timeToMinutes(todayData.isya);

let status, nextEvent, targetMin, progress, isNextDay = false;

if (currentMin < imsakMin) {
    status = 'Sahur';
    nextEvent = { name: 'Imsak', time: todayData.imsak, type: 'imsak' };
    targetMin = imsakMin;
    progress = 0;
} else if (currentMin < maghribMin) {
    status = 'Berpuasa';
    nextEvent = { name: 'Buka Puasa', time: todayData.maghrib, type: 'buka' };
    targetMin = maghribMin;
    progress = ((currentMin - imsakMin) / (maghribMin - imsakMin)) * 100;
} else if (currentMin < isyaMin) {
    status = 'Buka Puasa';
    nextEvent = { name: 'Isya', time: todayData.isya, type: 'isya' };
    targetMin = isyaMin;
    progress = 100;
} else {
    status = 'Istirahat';
    isNextDay = true;
    if (tomorrowData) {
        nextEvent = { name: 'Imsak', time: tomorrowData.imsak, type: 'imsak', isTomorrow: true };
        targetMin = timeToMinutes(tomorrowData.imsak) + (24 * 60);
        progress = 100;
    } else {
        nextEvent = { name: 'Selesai', time: '--:--', type: 'done' };
        targetMin = isyaMin;
        progress = 100;
    }
}

// Hitung countdown
const nowTotalSec = currentMin * 60 + currentSec;
let targetTotalSec = isNextDay && tomorrowData 
    ? (24 * 60 * 60) + (timeToMinutes(tomorrowData.imsak) * 60)
    : targetMin * 60;
    
let diffSec = Math.max(0, targetTotalSec - nowTotalSec);

// Generate API JSON
const apiData = {
    meta: {
        generated_at: wibTime.toISOString(),
        timezone: "Asia/Jakarta (WIB)",
        source: "Tirto.id / Bimas Islam Kemenag RI",
        location: {
            city: "Kotawaringin Timur",
            province: "Kalimantan Tengah",
            country: "Indonesia"
        }
    },
    current: {
        date: todayData.fullDate,
        time_now: `${String(wibTime.getUTCHours()).padStart(2, '0')}:${String(wibTime.getUTCMinutes()).padStart(2, '0')}:${String(wibTime.getUTCSeconds()).padStart(2, '0')}`,
        status: status,
        progress_percent: Math.round(progress),
        ramadan_day: todayIndex + 1
    },
    countdown: {
        target_event: nextEvent.name,
        target_time: nextEvent.time,
        target_time_12h: to12Hour(nextEvent.time),
        remaining: formatCountdown(diffSec),
        remaining_seconds: diffSec,
        is_tomorrow: isNextDay
    },
    next_prayer: {
        name: nextEvent.name,
        time: nextEvent.time,
        time_12h: to12Hour(nextEvent.time),
        type: nextEvent.type,
        is_tomorrow: nextEvent.isTomorrow || false
    },
    today_schedule: {
        imsak: todayData.imsak,
        imsak_12h: to12Hour(todayData.imsak),
        subuh: todayData.subuh,
        subuh_12h: to12Hour(todayData.subuh),
        dzuhur: todayData.dzuhur,
        dzuhur_12h: to12Hour(todayData.dzuhur),
        ashar: todayData.ashar,
        ashar_12h: to12Hour(todayData.ashar),
        maghrib: todayData.maghrib,
        maghrib_12h: to12Hour(todayData.maghrib),
        isya: todayData.isya,
        isya_12h: to12Hour(todayData.isya)
    }
};

// Tulis ke api.json
const outputPath = path.join(__dirname, '..', 'api.json');
fs.writeFileSync(outputPath, JSON.stringify(apiData, null, 2));

console.log('✅ api.json berhasil digenerate');
console.log(`📅 ${todayData.fullDate}`);
console.log(`⏰ Status: ${status}`);
console.log(`🎯 Next: ${nextEvent.name} (${nextEvent.time})`);
console.log(`⏳ Countdown: ${formatCountdown(diffSec)}`);
