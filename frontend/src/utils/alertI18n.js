import { getFacilityDetails } from './facilityI18n';

const MEDICINE_TRANSLATIONS = {
  'Paracetamol 500mg Tablets': { mr: 'पॅरासिटामॉल ५०० मिग्रॅ गोळ्या', hi: 'पैरासिटामोल ५०० मि.ग्रा. टैबलेट' },
  'Paracetamol': { mr: 'पॅरासिटामॉल', hi: 'पैरासिटामोल' },
  'Anti-Snake Venom (ASV)': { mr: 'सर्पदंश प्रतिबंधक लस (ASV)', hi: 'एंटी-स्नेक वेनम (ASV)' },
  'Anti-Snake Venom': { mr: 'सर्पदंश प्रतिबंधक लस', hi: 'एंटी-स्नेक वेनम' },
  'Rabies Vaccine (ARV)': { mr: 'रेबीज प्रतिबंधक लस (ARV)', hi: 'एंटी-रेबीज वैक्सीन (ARV)' },
  'Rabies Vaccine': { mr: 'रेबीज प्रतिबंधक लस', hi: 'एंटी-रेबीज वैक्सीन' },
  'Oral Rehydration Salts (ORS)': { mr: 'ओआरएस (ORS) जलसंजीवनी', hi: 'ओआरएस (ORS) घोल' },
  'Amoxicillin 500mg Capsules': { mr: 'अमॉक्सिसिलिन ५०० मिग्रॅ कॅप्सूल्स', hi: 'एमोक्सिसिलिन ५०० मि.ग्रा. कैप्सूल' },
  'Oxytocin 10 IU/ml Injection': { mr: 'ऑक्सिटोसिन १० IU/ml इंजेक्शन', hi: 'ऑक्सीटोसिन १० IU/ml इंजेक्शन' },
  'Magnesium Sulfate 50% Injection': { mr: 'मॅग्नेशियम सल्फेट ५०% इंजेक्शन', hi: 'मैग्नीशियम सल्फेट ५०% इंजेक्शन' },
  'Iron & Folic Acid Tablets': { mr: 'लोह व फॉलिक ॲसिड गोळ्या (IFA)', hi: 'आयरन एवं फोलिक एसिड टैबलेट (IFA)' },
  'Ceftriaxone 1g Injection': { mr: 'सेफ्ट्रिॲक्सोन १ ग्रॅम इंजेक्शन', hi: 'सेप्ट्रियाक्सोन १ ग्राम इंजेक्शन' },
  'Artesunate 60mg Injection': { mr: 'आर्टिसुनेट ६० मिग्रॅ इंजेक्शन', hi: 'आर्टिसुनेट ६० मि.ग्रा. इंजेक्शन' }
};

export function localizeAlert(alert, language = 'en') {
  if (!alert) return { title: '', message: '', facilityName: '' };
  if (language === 'en') {
    return {
      title: alert.title || '',
      message: alert.message || '',
      facilityName: alert.facility_name || 'Regional Facility'
    };
  }

  const { marathiName, hindiName } = getFacilityDetails({ name: alert.facility_name, id: alert.facility_id }, language);
  const facilityName = language === 'mr' ? (marathiName || alert.facility_name) : (hindiName || alert.facility_name);

  let title = alert.title || '';
  let message = alert.message || '';

  // Localize medicine names
  for (const [medEn, trans] of Object.entries(MEDICINE_TRANSLATIONS)) {
    const target = language === 'mr' ? trans.mr : trans.hi;
    if (title.includes(medEn)) title = title.split(medEn).join(target);
    if (message.includes(medEn)) message = message.split(medEn).join(target);
  }

  // Localize facility names in message/title
  if (alert.facility_name && facilityName) {
    if (title.includes(alert.facility_name)) title = title.split(alert.facility_name).join(facilityName);
    if (message.includes(alert.facility_name)) message = message.split(alert.facility_name).join(facilityName);
  }

  // Handle template patterns:
  // 1. Partial Receipt & Transit Damage: TRF-xxxx
  if (title.includes('Partial Receipt & Transit Damage')) {
    title = language === 'mr'
      ? title.replace('Partial Receipt & Transit Damage:', 'अंशतः प्राप्ती व वाहतुकीत नुकसान:')
      : title.replace('Partial Receipt & Transit Damage:', 'आंशिक प्राप्ति एवं पारगमन क्षति:');
    message = language === 'mr'
      ? `माल ${facilityName || 'आरोग्य केंद्रात'} पोहोचला, परंतु वाहतुकीदरम्यान नुकसान नोंदवले गेले. उर्वरित अनुपयोगी साठा नष्ट करण्यासाठी वर्ग केला.`
      : `माल ${facilityName || 'स्वास्थ्य केंद्र पर'} पहुंचा, लेकिन परिवहन में क्षति दर्ज की गई। शेष अनुपयोगी स्टॉक निस्तारण हेतु भेजा गया।`;
  }

  // 2. Transfer In Transit: XX units of MED
  else if (title.includes('Transfer In Transit:')) {
    title = language === 'mr'
      ? title.replace('Transfer In Transit:', 'हस्तांतरण मार्गावर:').replace('units of', 'युनिट्स -')
      : title.replace('Transfer In Transit:', 'स्थानांतरण मार्ग में:').replace('units of', 'यूनिट्स -');
    
    // Transport vehicle en route from X to Y (Z units).
    const mMatch = message.match(/Transport vehicle en route from (.*?) to (.*?) \((\d+) units\)\./);
    if (mMatch) {
      const srcEn = mMatch[1];
      const dstEn = mMatch[2];
      const qty = mMatch[3];
      const srcTrans = getFacilityDetails({ name: srcEn }, language);
      const dstTrans = getFacilityDetails({ name: dstEn }, language);
      const sName = language === 'mr' ? (srcTrans.marathiName || srcEn) : (srcTrans.hindiName || srcEn);
      const dName = language === 'mr' ? (dstTrans.marathiName || dstEn) : (dstTrans.hindiName || dstEn);
      message = language === 'mr'
        ? `वाहतूक वाहन ${sName} येथून ${dName} कडे रवाना (${qty} युनिट्स).`
        : `परिवहन वाहन ${sName} से ${dName} के लिए रवाना (${qty} यूनिट्स)।`;
    }
  }

  // 3. Transfer Delivered: XX units received at Y
  else if (title.includes('Transfer Delivered:')) {
    title = language === 'mr'
      ? title.replace('Transfer Delivered:', 'हस्तांतरण पूर्ण:').replace('units received at', 'युनिट्स प्राप्त -')
      : title.replace('Transfer Delivered:', 'स्थानांतरण वितरित:').replace('units received at', 'यूनिट्स प्राप्त -');
    message = language === 'mr'
      ? `साठा केंद्रात सुखरूप पोहोचला असून उपलब्ध साठ्यात समाविष्ट करण्यात आला आहे.`
      : `स्टॉक केंद्र पर सुरक्षित पहुंच गया है एवं उपलब्ध भंडार में दर्ज कर लिया गया है।`;
  }

  // 4. Critical Stockout / Deficit
  else if (title.toLowerCase().includes('critical') || title.toLowerCase().includes('stockout')) {
    title = language === 'mr'
      ? title.replace(/Critical Stockout Risk/i, 'गंभीर साठा तुटवडा जोखीम').replace(/Stockout Alert/i, 'साठा संपल्याची सूचना')
      : title.replace(/Critical Stockout Risk/i, 'गंभीर स्टॉक कमी जोखिम').replace(/Stockout Alert/i, 'स्टॉक समाप्ति सूचना');
  }

  return { title, message, facilityName };
}
