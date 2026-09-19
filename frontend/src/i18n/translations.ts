export type LanguageCode = 'en' | 'hi' | 'gu' | 'mr';

export interface Translations {
  appName: string;
  tagline: string;
  role: string;
  roles: {
    admin: string;
    hr: string;
    employee: string;
  };
  nav: {
    home: string;
    people: string;
    payroll: string;
    attendance: string;
    reports: string;
    settings: string;
    help: string;
  };
  people: {
    employeeDirectory: string;
    addEmployee: string;
    searchPlaceholder: string;
    filterDepartment: string;
  };
  dashboard: {
    thisMonthAtGlance: string;
    totalPayout: string;
    employeesPaid: string;
    pendingPayout: string;
    runPayrollCta: string;
    complianceDueDates: string;
    attentionRequired: string;
    whatChanged: string;
    newJoiner: string;
    unpaidLeave: string;
    missingBank: string;
    disclaimer: string;
    howMuchToPay: string;
    runPayrollFor: string;
    activeEmployees: string;
    pendingActions: string;
    complianceAlerts: string;
  };
  payrollWizard: {
    step1Title: string;
    step1Desc: string;
    step2Title: string;
    step2Desc: string;
    step3Title: string;
    step3Desc: string;
    step4Title: string;
    step4Desc: string;
    step5Title: string;
    step5Desc: string;
    markAllPresent: string;
    payableDays: string;
    lopDays: string;
    grossEarnings: string;
    totalDeductions: string;
    netPay: string;
    approveAndPay: string;
    back: string;
    next: string;
    payrollSuccessTitle: string;
    downloadBankAdvice: string;
    viewPayslips: string;
  };
  statutory: {
    basic: string;
    basicDesc: string;
    hra: string;
    hraDesc: string;
    pf: string;
    pfDesc: string;
    esi: string;
    esiDesc: string;
    pt: string;
    ptDesc: string;
    tds: string;
    tdsDesc: string;
  };
  payslip: {
    payslipFor: string;
    earnings: string;
    deductions: string;
    netSalaryCredited: string;
    amountInWords: string;
    downloadPdf: string;
    shareWhatsApp: string;
    bankTransferDetails: string;
  };
}

export const TRANSLATIONS: Record<LanguageCode, Translations> = {
  en: {
    appName: 'rndtechnosoft Payroll',
    tagline: 'Simple, Compliant Payroll for Indian Businesses',
    role: 'Viewing as',
    roles: {
      admin: 'Business Owner',
      hr: 'HR / Accountant',
      employee: 'Employee',
    },
    nav: {
      home: 'Home',
      people: 'People',
      payroll: 'Payroll',
      attendance: 'Attendance',
      reports: 'Reports',
      settings: 'Settings',
      help: 'Help',
    },
    people: {
      employeeDirectory: 'Employee Directory',
      addEmployee: 'Add New Employee',
      searchPlaceholder: 'Search by employee name, code, or department...',
      filterDepartment: 'Department',
    },
    dashboard: {
      thisMonthAtGlance: 'October 2026 at a glance',
      totalPayout: 'Total Salary Payout',
      employeesPaid: 'Employees to pay',
      pendingPayout: 'Payroll Status',
      runPayrollCta: 'Run Payroll for October 2026',
      complianceDueDates: 'Upcoming Compliance Dates',
      attentionRequired: 'Items needing your attention',
      whatChanged: 'What changed since last month',
      newJoiner: 'new joiner added with pro-rated days',
      unpaidLeave: 'employees took unpaid leave (LOP)',
      missingBank: 'employee has incomplete bank details',
      disclaimer: 'Note: All statutory calculations are estimates until verified by your Chartered Accountant.',
      howMuchToPay: 'How much to pay this month',
      runPayrollFor: 'Run Payroll for',
      activeEmployees: 'Active Employees',
      pendingActions: 'Items Needing Your Attention',
      complianceAlerts: 'Upcoming Compliance Dates',
    },
    payrollWizard: {
      step1Title: '1. Attendance & Leave',
      step1Desc: 'Review worked days and unpaid leaves',
      step2Title: '2. Earnings & Deductions',
      step2Desc: 'Verify PF, ESI, PT and net salary',
      step3Title: '3. What Changed',
      step3Desc: 'Check anomalies and differences',
      step4Title: '4. Approve & Pay',
      step4Desc: 'Final sign-off and bank transfer file',
      step5Title: '5. Payslips Ready',
      step5Desc: 'Download, print and share with team',
      markAllPresent: 'Quick: Mark All Present',
      payableDays: 'Payable Days',
      lopDays: 'Unpaid Leave (LOP)',
      grossEarnings: 'Gross Salary',
      totalDeductions: 'Total Deductions',
      netPay: 'Take-Home (Net Pay)',
      approveAndPay: 'Approve & Release October 2026 Payroll',
      back: 'Back',
      next: 'Continue to Next Step',
      payrollSuccessTitle: 'October 2026 Payroll Approved Successfully!',
      downloadBankAdvice: 'Download Bank Transfer Excel (NEFT)',
      viewPayslips: 'View & Share Payslips',
    },
    statutory: {
      basic: 'Basic Salary',
      basicDesc: 'Core salary component, foundation for PF and Gratuity',
      hra: 'House Rent Allowance (HRA)',
      hraDesc: 'Allowance for rented home, eligible for tax exemption',
      pf: 'EPF (Provident Fund)',
      pfDesc: 'Retirement savings: 12% deducted from Basic',
      esi: 'ESIC (Health Insurance)',
      esiDesc: 'Govt medical cover for gross salary up to ₹21,000/mo',
      pt: 'Professional Tax (PT)',
      ptDesc: 'State tax deducted from monthly salary (up to ₹200/mo)',
      tds: 'TDS (Income Tax)',
      tdsDesc: 'Income tax deducted as per New or Old tax regime',
    },
    payslip: {
      payslipFor: 'Salary Slip for',
      earnings: 'Earnings',
      deductions: 'Deductions',
      netSalaryCredited: 'Net Salary Credited to Bank',
      amountInWords: 'Amount in Words',
      downloadPdf: 'Download Payslip (PDF)',
      shareWhatsApp: 'Share on WhatsApp',
      bankTransferDetails: 'Bank Details for Transfer',
    },
  },
  hi: {
    appName: 'आरएनडी पेरोल',
    tagline: 'भारतीय व्यवसायों के लिए सरल और सुरक्षित पेरोल',
    role: 'भूमिका',
    roles: {
      admin: 'मालिक / एडमिन',
      hr: 'एचआर / मुनीम जी',
      employee: 'कर्मचारी',
    },
    nav: {
      home: 'होम',
      people: 'कर्मचारी',
      payroll: 'पेरोल',
      attendance: 'उपस्थिति',
      reports: 'रिपोर्ट',
      settings: 'सेटिंग्स',
      help: 'मदद',
    },
    people: {
      employeeDirectory: 'कर्मचारी सूची',
      addEmployee: 'नया कर्मचारी जोड़ें',
      searchPlaceholder: 'नाम, कोड या विभाग से खोजें...',
      filterDepartment: 'विभाग',
    },
    dashboard: {
      thisMonthAtGlance: 'अक्टूबर 2026 का मासिक हिसाब',
      totalPayout: 'इस महीने कुल वेतन भुगतान',
      employeesPaid: 'वेतन पाने वाले कुल कर्मचारी',
      pendingPayout: 'पेरोल की स्थिति',
      runPayrollCta: 'अक्टूबर 2026 का पेरोल चलाएं',
      complianceDueDates: 'सरकारी टैक्स और चालान की तारीखें',
      attentionRequired: 'ध्यान देने योग्य जरूरी बातें',
      whatChanged: 'पिछले महीने से क्या बदलाव हुआ',
      newJoiner: 'नए कर्मचारी जुड़े (दिनों के हिसाब से वेतन)',
      unpaidLeave: 'कर्मचारियों ने अवैतनिक छुट्टी (LOP) ली',
      missingBank: 'कर्मचारी का बैंक खाता अधूरा है',
      disclaimer: 'सूचना: सीए (अकाउंटेंट) द्वारा अंतिम पुष्टि होने तक ये गणनाएं अनुमानित हैं।',
      howMuchToPay: 'इस महीने कुल कितना भुगतान करना है',
      runPayrollFor: 'पेरोल चलाएं:',
      activeEmployees: 'सक्रिय कर्मचारी',
      pendingActions: 'जरूरी कार्य सूची',
      complianceAlerts: 'सरकारी अनुपालन तिथियां',
    },
    payrollWizard: {
      step1Title: '१. उपस्थिति और छुट्टियां',
      step1Desc: 'काम के दिन और बिना वेतन की छुट्टियां जांचें',
      step2Title: '२. कमाई और कटौती',
      step2Desc: 'पीएफ, ईएसआई, पीटी और हाथ में आने वाला वेतन',
      step3Title: '३. क्या नया बदलाव हुआ',
      step3Desc: 'नए कर्मचारी और वेतन अंतर देखें',
      step4Title: '४. मंज़ूरी और भुगतान',
      step4Desc: 'अंतिम मंज़ूरी और बैंक ट्रांसफर फाइल',
      step5Title: '५. पे-स्लिप तैयार',
      step5Desc: 'डाउनलोड करें या व्हाट्सएप पर भेजें',
      markAllPresent: 'सभी को उपस्थित मार्क करें',
      payableDays: 'वेतन योग्य दिन',
      lopDays: 'छुट्टी (LOP)',
      grossEarnings: 'कुल वेतन (ग्रॉस)',
      totalDeductions: 'कुल कटौती',
      netPay: 'हाथ में आने वाला वेतन (नेट)',
      approveAndPay: 'अक्टूबर 2026 का पेरोल मंजूर करें',
      back: 'पीछे जाएं',
      next: 'आगे बढ़ें',
      payrollSuccessTitle: 'अक्टूबर 2026 पेरोल सफलतापूर्वक स्वीकृत!',
      downloadBankAdvice: 'बैंक ट्रांसफर फाइल (NEFT) डाउनलोड करें',
      viewPayslips: 'पे-स्लिप देखें और भेजें',
    },
    statutory: {
      basic: 'मूल वेतन (Basic)',
      basicDesc: 'मुख्य वेतन जिस पर पीएफ और ग्रेच्युटी की गणना होती है',
      hra: 'मकान किराया भत्ता (HRA)',
      hraDesc: 'किराए के घर के लिए मिलने वाला कर-मुक्त भत्ता',
      pf: 'पीएफ (भविष्य निधि)',
      pfDesc: 'सेवानिवृत्ति बचत: मूल वेतन का १२% जमा होता है',
      esi: 'ईएसआई (स्वास्थ्य बीमा)',
      esiDesc: 'सरकारी स्वास्थ्य बीमा (₹२१,००० से कम वेतन वालों के लिए)',
      pt: 'प्रोफेशनल टैक्स (PT)',
      ptDesc: 'राज्य सरकार का टैक्स (अधिकतम ₹२०० प्रति माह)',
      tds: 'टीडीएस (आयकर)',
      tdsDesc: 'वार्षिक आय के अनुसार काटा जाने वाला इनकम टैक्स',
    },
    payslip: {
      payslipFor: 'वेतन पर्ची (Payslip)',
      earnings: 'कमाई',
      deductions: 'कटौतियां',
      netSalaryCredited: 'बैंक खाते में जमा हुआ शुद्ध वेतन',
      amountInWords: 'शब्दों में राशि',
      downloadPdf: 'पे-स्लिप डाउनलोड करें (PDF)',
      shareWhatsApp: 'व्हाट्सएप पर भेजें',
      bankTransferDetails: 'बैंक ट्रांसफर की जानकारी',
    },
  },
  gu: {
    appName: 'આરએનડી પેરોલ',
    tagline: 'ભારતીય વેપારીઓ માટે સરળ અને સચોટ પગાર સિસ્ટમ',
    role: 'ભૂમિકા',
    roles: {
      admin: 'માલિક / એડમિન',
      hr: 'એકાઉન્ટન્ટ / એચઆર',
      employee: 'કર્મચારી',
    },
    nav: {
      home: 'હોમ',
      people: 'કર્મચારીઓ',
      payroll: 'પગાર (પેરોલ)',
      attendance: 'હાજરી',
      reports: 'રિપોર્ટ્સ',
      settings: 'સેટિંગ્સ',
      help: 'મદદ',
    },
    people: {
      employeeDirectory: 'કર્મચારી યાદી',
      addEmployee: 'નવા કર્મચારી ઉમેરો',
      searchPlaceholder: 'નામ, કોડ કે વિભાગ દ્વારા શોધો...',
      filterDepartment: 'વિભાગ',
    },
    dashboard: {
      thisMonthAtGlance: 'ઓક્ટોબર ૨૦૨૬ નો એકંદર હિસાબ',
      totalPayout: 'આ મહિને ચૂકવવાપાત્ર કુલ રકમ',
      employeesPaid: 'પગાર મેળવનાર કર્મચારીઓ',
      pendingPayout: 'પેરોલ સ્થિતિ',
      runPayrollCta: 'ઓક્ટોબર ૨૦૨૬ નો પગાર બનાવો',
      complianceDueDates: 'સરકારી ટેક્સ અને ચલણની તારીખો',
      attentionRequired: 'ધ્યાન આપવા જેવી બાબતો',
      whatChanged: 'ગયા મહિના કરતા શું ફેરફાર છે',
      newJoiner: 'નવા કર્મચારી જોડાયા (દિવસ મુજબ પગાર)',
      unpaidLeave: 'કર્મચારીઓએ બિન-પગારી રજા લીધી',
      missingBank: 'કર્મચારીની બેંક વિગતો અધૂરી છે',
      disclaimer: 'નોંધ: સીએ દ્વારા ચકાસણી ન થાય ત્યાં સુધી આ આંકડા અંદાજિત છે.',
      howMuchToPay: 'આ મહિને કેટલો પગાર ચૂકવવાનો છે',
      runPayrollFor: 'પગાર બનાવો:',
      activeEmployees: 'સક્રિય કર્મચારીઓ',
      pendingActions: 'ધ્યાન આપવા જેવી બાબતો',
      complianceAlerts: 'સરકારી ટેક્સ તારીખો',
    },
    payrollWizard: {
      step1Title: '૧. હાજરી અને રજાઓ',
      step1Desc: 'કામના દિવસો અને કાપવાની રજાઓ તપાસો',
      step2Title: '૨. કમાણી અને કપાત',
      step2Desc: 'પીએફ, ઈએસઆઈ, પીટી અને ચોખ્ખો પગાર',
      step3Title: '૩. નવો ફેરફાર',
      step3Desc: 'નવા કર્મચારી અને પગાર તફાવત',
      step4Title: '૪. મંજૂરી અને ચુકવણી',
      step4Desc: 'અંતિમ મંજૂરી અને બેંક ફાઈલ',
      step5Title: '૫. પે-સ્લિપ તૈયાર',
      step5Desc: 'ડાઉનલોડ કરો અથવા વોટ્સએપ પર મોકલો',
      markAllPresent: 'બધાને હાજર માર્ક કરો',
      payableDays: 'પગારપાત્ર દિવસો',
      lopDays: 'કાપવાની રજા',
      grossEarnings: 'કુલ પગાર (ગ્રોસ)',
      totalDeductions: 'કુલ કપાત',
      netPay: 'હાથમાં આવતો પગાર (નેટ)',
      approveAndPay: 'ઓક્ટોબર ૨૦૨૬ નો પગાર મંજૂર કરો',
      back: 'પાછળ જાઓ',
      next: 'આગળ વધો',
      payrollSuccessTitle: 'ઓક્ટોબર ૨૦૨૬ નો પગાર સફળતાપૂર્વક મંજૂર થયો!',
      downloadBankAdvice: 'બેંક ટ્રાન્સફર એક્સેલ (NEFT) ડાઉનલોડ કરો',
      viewPayslips: 'પે-સ્લિપ જુઓ અને મોકલો',
    },
    statutory: {
      basic: 'મૂળ પગાર (Basic)',
      basicDesc: 'મૂળભૂત પગાર જેના પર પીએફ ગણાય છે',
      hra: 'ઘર ભાડું ભથ્થું (HRA)',
      hraDesc: 'ભાડાના મકાન માટે મળતું કર-મુક્ત ભથ્થું',
      pf: 'પીએફ (ભવિષ્ય નિધિ)',
      pfDesc: 'નિવૃત્તિ બચત: મૂળ પગારમાંથી ૧૨% કપાત',
      esi: 'ઈએસઆઈ (મેડિકલ વીમો)',
      esiDesc: '₹૨૧,૦૦૦ સુધીના પગાર માટે સરકારી આરોગ્ય વીમો',
      pt: 'પ્રોફેશનલ ટેક્સ (PT)',
      ptDesc: 'રાજ્ય સરકારનો ટેક્સ (મહત્તમ ₹૨૦૦/મહિને)',
      tds: 'ટીડીએસ (ઇન્કમ ટેક્સ)',
      tdsDesc: 'વાર્ષિક આવક મુજબ કપાતો આવકવેરો',
    },
    payslip: {
      payslipFor: 'પગાર સ્લિપ (Salary Slip)',
      earnings: 'કમાણી',
      deductions: 'કપાત',
      netSalaryCredited: 'બેંક ખાતામાં જમા થયેલ ચોખ્ખો પગાર',
      amountInWords: 'શબ્દોમાં રકમ',
      downloadPdf: 'સ્લિપ ડાઉનલોડ કરો (PDF)',
      shareWhatsApp: 'વોટ્સએપ પર શેર કરો',
      bankTransferDetails: 'બેંક ટ્રાન્સફર વિગતો',
    },
  },
  mr: {
    appName: 'आरएनडी पेरोल',
    tagline: 'भारतीय उद्योगांसाठी सोपी आणि अचूक पेरोल प्रणाली',
    role: 'भूमिका',
    roles: {
      admin: 'मालक / व्यवस्थापक',
      hr: 'एचआर / लेखापाल',
      employee: 'कर्मचारी',
    },
    nav: {
      home: 'मुख्यपृष्ठ',
      people: 'कर्मचारी',
      payroll: 'पेरोल',
      attendance: 'हजेरी',
      reports: 'अहवाल',
      settings: 'सेटिंग्ज',
      help: 'मदत',
    },
    people: {
      employeeDirectory: 'कर्मचारी निर्देशिका',
      addEmployee: 'नवीन कर्मचारी जोडा',
      searchPlaceholder: 'नाव, कोड किंवा विभागावरून शोधा...',
      filterDepartment: 'विभाग',
    },
    dashboard: {
      thisMonthAtGlance: 'ऑक्टोबर २०२६ चा संक्षिप्त आढावा',
      totalPayout: 'या महिन्यातील एकूण वेतन वाटप',
      employeesPaid: 'पगार मिळणारे एकूण कर्मचारी',
      pendingPayout: 'पेरोल स्थिती',
      runPayrollCta: 'ऑक्टोबर २०२६ चा पेरोल चालवा',
      complianceDueDates: 'सरकारी कर व चालान देय तारखा',
      attentionRequired: 'महत्त्वाच्या बाबी',
      whatChanged: 'मागील महिन्यापेक्षा काय बदलले',
      newJoiner: 'नवीन कर्मचारी जोडले गेले',
      unpaidLeave: 'कर्मचाऱ्यांची विनावेतन सुट्टी (LOP)',
      missingBank: 'कर्मचाऱ्याचे बँक तपशील अपूर्ण आहेत',
      disclaimer: 'टीप: सीए तपासेपर्यंत ही आकडेवारी अंदाजे आहे.',
      howMuchToPay: 'या महिन्यात किती पगार द्यायचा आहे',
      runPayrollFor: 'पेरोल चालवा:',
      activeEmployees: 'सक्रिय कर्मचारी',
      pendingActions: 'महत्त्वाच्या बाबी',
      complianceAlerts: 'सरकारी देय तारखा',
    },
    payrollWizard: {
      step1Title: '१. हजेरी व सुट्ट्या',
      step1Desc: 'कामाचे दिवस व विनावेतन सुट्ट्या तपासा',
      step2Title: '२. कमाई व कपात',
      step2Desc: 'पीएफ, ईएसआय, पीटी आणि हातात मिळणारा पगार',
      step3Title: '३. काय बदल झाले',
      step3Desc: 'नवीन कर्मचारी व वेतन फरक तपासा',
      step4Title: '४. मंजुरी व वाटप',
      step4Desc: 'अंतिम मंजुरी आणि बँक ट्रान्सफर फाईल',
      step5Title: '५. वेतन पावती तयार',
      step5Desc: 'डाऊनलोड करा किंवा व्हॉट्सॲपवर पाठवा',
      markAllPresent: 'सर्वांना हजर चिन्हांकित करा',
      payableDays: 'वेतनपात्र दिवस',
      lopDays: 'विनावेतन रजा (LOP)',
      grossEarnings: 'एकूण वेतन (ग्रॉस)',
      totalDeductions: 'एकूण कपात',
      netPay: 'हातात मिळणारा पगार (नेट)',
      approveAndPay: 'ऑक्टोबर २०२६ पेरोल मंजूर करा',
      back: 'मागे जा',
      next: 'पुढे चला',
      payrollSuccessTitle: 'ऑक्टोबर २०२६ पेरोल यशस्वीपणे मंजूर!',
      downloadBankAdvice: 'बँक ट्रान्सफर एक्सेल (NEFT) डाऊनलोड करा',
      viewPayslips: 'वेतन पावती पहा व पाठवा',
    },
    statutory: {
      basic: 'मूळ वेतन (Basic)',
      basicDesc: 'मुख्य वेतन ज्यावर पीएफ आणि ग्रॅच्युइटी मोजली जाते',
      hra: 'घरभाडे भत्ता (HRA)',
      hraDesc: 'भाड्याच्या घरासाठी मिळणारा करमुक्त भत्ता',
      pf: 'पीएफ (भविष्य निर्वाह निधी)',
      pfDesc: 'निवृत्ती बचत: मूळ वेतनातून १२% कपात',
      esi: 'ईएसआय (आरोग्य विमा)',
      esiDesc: '₹२१,००० पेक्षा कमी वेतनासाठी सरकारी वैद्यकीय विमा',
      pt: 'व्यावसायिक कर (PT)',
      ptDesc: 'राज्य शासनाचा कर (दरमहा कमाल ₹२००, फेब्रु मध्ये ₹३००)',
      tds: 'टीडीएस (आयकर)',
      tdsDesc: 'वार्षिक उत्पन्नानुसार कापला जाणारा इन्कम टॅक्स',
    },
    payslip: {
      payslipFor: 'वेतन पावती (Salary Slip)',
      earnings: 'कमाई',
      deductions: 'कपात',
      netSalaryCredited: 'बँक खात्यात जमा झालेला प्रत्यक्ष पगार',
      amountInWords: 'अक्षरी रक्कम',
      downloadPdf: 'पावती डाऊनलोड करा (PDF)',
      shareWhatsApp: 'व्हॉट्सॲपवर शेअर करा',
      bankTransferDetails: 'बँक ट्रान्सफर माहिती',
    },
  },
};
