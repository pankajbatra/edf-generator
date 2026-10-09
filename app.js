/* EDF Generator. Runs entirely in the browser. No network calls. */
(function () {
  'use strict';

  var APP_ID = 'edf-generator';
  var SCHEMA_VERSION = 1;
  var LS_DRAFT = 'edfgen.draft';
  var LS_AUTOSAVE = 'edfgen.autosave';

  // ---------- defaults ----------
  function blankInvoice() {
    return {
      client: '', address: '', country: '', no: '', date: '', currency: 'USD',
      amount: '', net: '', rate: '', contract: '', description: '', sac: '',
      payment: 'periodical', remarks: '', received: ''
    };
  }

  function defaults() {
    return {
      exporter: {
        name: '', address: '', iec: '', gstin: '', pan: '', entityType: 'company',
        category: 'others', categoryOther: 'Software services exporter, not registered with STPI / SEZ / EOU',
        signatory: '', designation: 'Authorised Signatory', place: ''
      },
      bank: { name: '', address: '', ifsc: '', adCode: '', account: '' },
      filing: {
        month: '', exportType: 'Software', nature: 'Non-Advance', exportKind: 'Regular',
        delivery: 'Internet', realisation: 'Others', realisationSpecify: '',
        description: '', sac: '998314', purposeCode: 'P0802', formNo: '', signDate: '',
        realised: 'yes', realisationDate: '',
        thirdPartyName: '', thirdPartyRel: '', thirdPartyAddress: '',
        fill2A: true
      },
      invoices: [blankInvoice()]
    };
  }

  var state = defaults();

  // ---------- utils ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clean(s) { return String(s == null ? '' : s).trim(); }
  function num(v) {
    if (v === '' || v == null) return NaN;
    var n = parseFloat(String(v).replace(/,/g, ''));
    return isFinite(n) ? n : NaN;
  }
  function deepMerge(base, src) {
    if (!src || typeof src !== 'object') return base;
    Object.keys(base).forEach(function (k) {
      if (!(k in src)) return;
      if (Array.isArray(base[k])) {
        if (Array.isArray(src[k])) base[k] = src[k];
      } else if (base[k] && typeof base[k] === 'object') {
        deepMerge(base[k], src[k]);
      } else {
        base[k] = src[k];
      }
    });
    return base;
  }
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? o : o[k]; }, obj); }
  function setPath(obj, path, val) {
    var ks = path.split('.'); var last = ks.pop();
    var o = ks.reduce(function (a, k) { return a[k]; }, obj);
    o[last] = val;
  }
  function fmtDate(iso) {
    if (!iso) return '';
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    return m ? m[3] + '-' + m[2] + '-' + m[1] : iso;
  }
  function parseISO(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
    return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : null;
  }
  function isoOf(d) { return d.toISOString().slice(0, 10); }
  function addMonths(d, n) {
    var y = d.getUTCFullYear(), m = d.getUTCMonth() + n, day = d.getUTCDate();
    var last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    return new Date(Date.UTC(y, m, Math.min(day, last)));
  }
  function monthEnd(ym) {
    var m = /^(\d{4})-(\d{2})$/.exec(ym || '');
    return m ? new Date(Date.UTC(+m[1], +m[2], 0)) : null;
  }
  function monthLabel(ym) {
    var d = monthEnd(ym); if (!d) return '';
    return d.toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  }
  function fmtFC(n) { return isNaN(n) ? '' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtINR(n) { return isNaN(n) ? '' : n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function round2(n) { return Math.round(n * 100) / 100; }

  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
    'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  function words99(n) { return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? ' ' + ONES[n % 10] : ''); }
  function words999(n) {
    var h = Math.floor(n / 100), r = n % 100, out = [];
    if (h) out.push(ONES[h] + ' Hundred');
    if (r) out.push(words99(r));
    return out.join(' ');
  }
  function indianWords(n) {
    if (n === 0) return 'Zero';
    var parts = [];
    var crore = Math.floor(n / 1e7); n %= 1e7;
    var lakh = Math.floor(n / 1e5); n %= 1e5;
    var thou = Math.floor(n / 1e3); n %= 1e3;
    if (crore) parts.push((crore > 999 ? indianWords(crore) : words999(crore)) + ' Crore');
    if (lakh) parts.push(words99(lakh) + ' Lakh');
    if (thou) parts.push(words99(thou) + ' Thousand');
    if (n) parts.push(words999(n));
    return parts.join(' ');
  }
  function rupeesInWords(amount) {
    var paise = Math.round(amount * 100);
    var r = Math.floor(paise / 100), p = paise % 100;
    var s = 'Rupees ' + indianWords(r);
    if (p) s += ' and ' + words99(p) + ' Paise';
    return s + ' Only';
  }

  // ---------- computed ----------
  function compute(s) {
    var invs = s.invoices.map(function (iv, i) {
      var amount = num(iv.amount);
      var net = num(iv.net); if (isNaN(net)) net = amount;
      var cur = clean(iv.currency).toUpperCase() || 'USD';
      var rate = cur === 'INR' ? 1 : num(iv.rate);
      var inr = (!isNaN(net) && !isNaN(rate)) ? round2(net * rate) : NaN;
      return {
        i: i, raw: iv, amount: amount, net: net, cur: cur, rate: rate, inr: inr,
        deduction: (!isNaN(amount) && !isNaN(net)) ? round2(amount - net) : 0,
        sac: clean(iv.sac) || clean(s.filing.sac),
        description: clean(iv.description) || clean(s.filing.description)
      };
    });
    var totalInr = 0, allRates = invs.length > 0;
    invs.forEach(function (x) { if (isNaN(x.inr)) allRates = false; else totalInr += x.inr; });
    totalInr = round2(totalInr);
    var uniq = function (arr) { return arr.filter(function (v, i) { return v && arr.indexOf(v) === i; }); };
    return {
      invs: invs,
      totalInr: totalInr,
      allRates: allRates,
      clients: uniq(invs.map(function (x) { return clean(x.raw.client); })),
      countries: uniq(invs.map(function (x) { return clean(x.raw.country); })),
      currencies: uniq(invs.map(function (x) { return x.cur; })),
      sacs: uniq(invs.map(function (x) { return x.sac; })),
      thirdParty: !!clean(s.filing.thirdPartyName),
      isCompany: s.exporter.entityType !== 'individual',
      realised: s.filing.realised === 'yes'
    };
  }

  // ---------- document model ----------
  // block: {type:'p', runs, align, size} | {type:'table', cols:[%], small, rows:[[cell]]} | {type:'notes', items}
  // cell: {span, paras:[[run]]}; run: {t, b, s, h}
  function R(t, f) { f = f || ''; return { t: String(t), b: f.indexOf('b') >= 0, s: f.indexOf('s') >= 0, h: f.indexOf('h') >= 0 }; }
  function C(span) { return { span: span, paras: Array.prototype.slice.call(arguments, 1) }; }
  function LV(label, value, placeholder) {
    var v = clean(value);
    if (v) return [R(label), R(v, 'b')];
    if (placeholder) return [R(label), R(placeholder, 'bh')];
    return [R(label)];
  }
  function tick(on) { return on ? R('[ √ ]', 'b') : R('[    ]'); }
  function pair(a, sep, b, pickA) {
    return pickA ? [R(a), R(sep + b, 's')] : [R(a + sep, 's'), R(b)];
  }
  function lines(text) { return clean(text).split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean); }

  function buildModel(s, c) {
    var e = s.exporter, bk = s.bank, f = s.filing;
    var blocks = [];
    blocks.push({ type: 'p', runs: [R('Annex')] });
    blocks.push({ type: 'p', runs: [R('Export Declaration Form', 'b')], align: 'center', size: 12 });

    var catOpts = [['dta', 'Custom (DTA units)'], ['sez', 'SEZ'], ['eou', '100% EOU'], ['warehouse', 'Warehouse export']];
    var catRuns = [];
    catOpts.forEach(function (o) { catRuns.push(tick(e.category === o[0]), R(' ' + o[1] + '   ')); });
    catRuns.push(tick(e.category === 'others'), R(' others (Specify): '));
    if (e.category === 'others') catRuns.push(R(clean(e.categoryOther) || '..........', clean(e.categoryOther) ? 'b' : ''));

    var del = f.delivery;
    var modeRuns = [tick(false), R(' Air   '), tick(false), R(' Land   '), tick(false), R(' Sea   '), tick(false), R(' Post/Couriers   '),
      tick(del === 'Internet'), R(' Internet   ', del === 'Internet' ? 'b' : ''), tick(del === 'Others'), R(' others')];

    var specify = clean(f.realisationSpecify) || ('Inward remittance (SWIFT) directly to exporter\'s account with the AD bank' +
      (f.nature === 'Advance' ? ', received in advance' : ', after rendering of services (non-advance)'));
    var realParas = [[R('Mode of Realisation:')],
      [tick(f.realisation === 'LC'), R(' L/C   '), tick(f.realisation === 'BG'), R(' BG   '), tick(f.realisation === 'Others'), R(' Others ', f.realisation === 'Others' ? 'b' : ''),
        R('(advance payment, etc. including transfer/remittance to bank a/c maintained overseas)')]];
    if (f.realisation === 'Others') realParas.push([R('Specify: '), R(specify, 'b')]);

    var single = c.clients.length <= 1;
    var first = c.invs[0] ? c.invs[0].raw : blankInvoice();
    var consignee = single
      ? [[R('Consignee Name & Address:')], [R(clean(first.client) || '', 'b')]].concat(lines(first.address).map(function (l) { return [R(l, 'b')]; }))
      : [[R('Consignee Name & Address:')], [R('Multiple service recipients. Details in Part 2B.', 'b')]];

    var tp = c.thirdParty;
    var thirdParas = [LV('Third Party name & Address (In case of third Party Payments for Exports): ',
      tp ? clean(f.thirdPartyName) + (clean(f.thirdPartyAddress) ? ', ' + clean(f.thirdPartyAddress) : '') : 'Not applicable'),
      LV('Relationship between Exporter & Third Party: ', tp ? f.thirdPartyRel : 'Not applicable', tp ? '[relationship]' : '')];

    var adParas = [[R('AD Name & Address:')], [R(clean(bk.name), 'b')]].concat(lines(bk.address).map(function (l) { return [R(l, 'b')]; }));
    if (clean(bk.ifsc)) adParas.push([R('IFSC: ' + clean(bk.ifsc).toUpperCase(), 'b')]);

    var descParas = [LV('Description of Goods/Services: ', f.description, '[description of services]')];
    if (c.sacs.length) descParas.push(LV('SAC: ', c.sacs.join(', ')));

    var inrText;
    if (c.allRates && c.invs.length) {
      var calc;
      if (c.invs.length === 1 && c.invs[0].cur !== 'INR') {
        var x = c.invs[0];
        calc = ' (' + x.cur + ' ' + fmtFC(x.net) + ' x Rs ' + x.rate + ' per ' + x.cur + ' = Rs ' + fmtINR(x.inr) + ')';
      } else {
        calc = ' (Rs ' + fmtINR(c.totalInr) + ', total of the invoices in Part 2B converted at the exchange rates used in the GST invoices)';
      }
      inrText = [R('Total FOB/Services value in words (INR): '), R(rupeesInWords(c.totalInr) + calc, 'b')];
    } else {
      inrText = [R('Total FOB/Services value in words (INR): '), R('[enter exchange rate for every invoice]', 'bh')];
    }

    var exportTypeLabel = f.exportType === 'Software' ? 'Software (Export of Software Services)' : 'Service (Export of Services)';

    var t1 = { type: 'table', cols: [27, 23, 25, 25], rows: [
      [C(4, [R('1. General Information:')])],
      [C(2, LV('Type of export: ', exportTypeLabel)), C(2, clean(f.formNo) ? LV('Form No: ', f.formNo) : [R('Form No: '), R('(to be allotted by AD bank)')])],
      [C(2, LV('Shipping Bill No. & Date: ', 'Not applicable (export of services)')), C(2, [R('Mode of Transport/Delivery:')], modeRuns)],
      [C(2, [R('Category of Exporter:')], catRuns), C(2, LV('AD code: ', bk.adCode, '[AD code, to be confirmed by bank]'))],
      [C(2, LV('IE Code: ', clean(e.iec).toUpperCase(), '[IEC]'), LV('GSTIN: ', clean(e.gstin).toUpperCase()), LV('PAN: ', clean(e.pan).toUpperCase())), { span: 2, paras: adParas }],
      [{ span: 2, paras: [[R('Exporter\'s Name & Address:')], [R(clean(e.name), 'b')]].concat(lines(e.address).map(function (l) { return [R(l, 'b')]; })) }, { span: 2, paras: realParas }],
      [{ span: 2, paras: consignee }, C(2, LV('Port of Loading / Source Port in case of SEZ: ', 'Not applicable'))],
      [{ span: 2, paras: thirdParas }, C(1, LV('Country of Final Destination: ', c.countries.join(', '), '[country]')), C(1, LV('Port of Discharge: ', 'Not applicable'))],
      [C(2, LV('Name of the AD and AD code, in case of LC/BG: ', (f.realisation === 'LC' || f.realisation === 'BG') ? clean(bk.name) + (clean(bk.adCode) ? ', ' + clean(bk.adCode) : '') : 'Not applicable')),
        C(2, LV('Date of Let Export order (LEO): ', 'Not applicable'))],
      [{ span: 4, paras: descParas }],
      [C(4, inrText)]
    ] };
    blocks.push(t1);

    // Part 2A
    var t2 = { type: 'table', cols: [27, 23, 25, 25], rows: [
      [C(4, [R('2A. Details of Export Value^ of Goods (This part shall be repeated for each invoice drawn under a shipping bill)')])]
    ] };
    if (f.fill2A) {
      c.invs.forEach(function (x) {
        var iv = x.raw;
        var pay = iv.payment || 'periodical';
        t2.rows.push([
          { span: 1, paras: [[R('Client Name & Address:')], [R(clean(iv.client), 'b')]].concat(lines(iv.address).map(function (l) { return [R(l, 'b')]; }))
            .concat(clean(iv.country) ? [[R(clean(iv.country), 'b')]] : []) },
          C(1, LV('Invoice No. ', iv.no, '[no.]'), LV('Invoice date: ', fmtDate(iv.date), '[date]'), LV('Invoice Currency: ', x.cur),
            LV('Invoice Amount: ', fmtFC(x.amount), '[amount]'), LV('Contract No. and Date: ', iv.contract, 'Not applicable')),
          C(2, [R('Nature of payment in terms of Contract:')],
            [tick(false), R(' FOB  '), tick(false), R(' CIF  '), tick(false), R(' C&F  '), tick(false), R(' CI')],
            [tick(pay === 'periodical'), R(' periodical  ', pay === 'periodical' ? 'b' : ''), tick(pay === 'milestone'), R(' milestone  ', pay === 'milestone' ? 'b' : ''),
              tick(pay === 'advance'), R(' advance  ', pay === 'advance' ? 'b' : ''), tick(pay === 'others'), R(' others', pay === 'others' ? 'b' : '')],
            LV('HSN/Service Accounting Codes (SAC): ', x.sac, '[SAC]'))
        ]);
        t2.rows.push([C(2, [R('Particulars')]), C(1, [R('Currency')]), C(1, [R('Amount')])]);
        var ded = x.deduction > 0 ? fmtFC(x.deduction) : 'Nil';
        [['FOB/Services Value', fmtFC(x.amount)], ['Freight/Transmission', 'Nil'], ['Insurance', 'Nil'], ['Commission', 'Nil'], ['Discount', 'Nil'],
          ['Other Deduction', ded], ['Packing Charges', 'Nil'], ['Full export value / Net Realisable export value', fmtFC(x.net)]]
          .forEach(function (row) { t2.rows.push([C(2, [R(row[0])]), C(1, [R(x.cur, 'b')]), C(1, [R(row[1], 'b')])]); });
      });
    } else {
      t2.rows.push([C(4, [R('Not applicable: export of services. Details in Part 2B.', 'b')])]);
    }
    blocks.push(t2);

    // Part 2B
    var t3 = { type: 'table', small: true, cols: [4, 15, 7, 7, 8, 6, 9, 9, 11, 12, 6, 6], rows: [
      [C(12, [R('2B. Details of Export Value^ of Services')])],
      [C(12, [R('Details of services provided to multiple recipients')])],
      ['S. No.', 'Service recipient Name & Address', 'Country', 'Invoice No.', 'Invoice Date', 'Currency', 'Amount', 'Net Realisable value',
        'Contract No., if any, and Date', 'Description of services', 'SAC Code', 'Remarks'].map(function (h) { return C(1, [R(h)]); })
    ] };
    c.invs.forEach(function (x, idx) {
      var iv = x.raw;
      var remark = clean(iv.remarks) || ((f.nature === 'Advance' ? 'Advance' : 'Non-advance') + '. ' + (f.exportKind === 'Project' ? 'Project' : 'Regular') + ' export.');
      t3.rows.push([
        C(1, [R(String(idx + 1), 'b')]),
        C(1, [R(clean(iv.client) + (clean(iv.address) ? ', ' + lines(iv.address).join(', ') : ''), 'b')]),
        C(1, [R(clean(iv.country), 'b')]),
        C(1, [R(clean(iv.no) || '[no.]', clean(iv.no) ? 'b' : 'bh')]),
        C(1, [R(fmtDate(iv.date) || '[date]', iv.date ? 'b' : 'bh')]),
        C(1, [R(x.cur, 'b')]),
        C(1, [R(fmtFC(x.amount), 'b')]),
        C(1, [R(x.cur + ' ' + fmtFC(x.net), 'b')]),
        C(1, [R(clean(iv.contract) || 'Not applicable', 'b')]),
        C(1, [R(x.description, 'b')]),
        C(1, [R(x.sac, 'b')]),
        C(1, [R(remark, 'b')])
      ]);
    });
    if (c.invs.length > 1) {
      var sameCur = c.currencies.length === 1;
      t3.rows.push([C(6, [R('Total', 'b')]),
        C(1, [R(sameCur ? fmtFC(c.invs.reduce(function (a, x) { return a + (isNaN(x.amount) ? 0 : x.amount); }, 0)) : 'Mixed', 'b')]),
        C(1, [R(sameCur ? c.currencies[0] + ' ' + fmtFC(c.invs.reduce(function (a, x) { return a + (isNaN(x.net) ? 0 : x.net); }, 0)) : 'Mixed', 'b')]),
        C(4, [R(c.allRates ? 'INR equivalent: Rs ' + fmtINR(c.totalInr) : '', 'b')])]);
    }
    blocks.push(t3);

    // Part 3, 4, 5
    var isCo = c.isCompany;
    var realDate = clean(f.realisationDate)
      ? fmtDate(f.realisationDate) + (c.realised ? ' (date of receipt of inward remittance by AD bank)' : '')
      : '';
    var fx = c.currencies.some(function (x) { return x !== 'INR'; });
    var inr = c.currencies.indexOf('INR') >= 0;
    var decl = [].concat(
      pair('I', ' /', 'We', !isCo), [R(' hereby declare that ')], pair('I', '/', 'we', !isCo), [R(' @')], pair('am', '/', 'are', !isCo),
      [R(' the ')], pair('seller/consignor of the goods', '/', ' provider of services', false),
      [R(' in respect of which this declaration is made and that the particulars given above are true and that the value to be received from the ')],
      pair('buyer', '/', 'third party', !c.thirdParty),
      [R(' represents the export value^ contracted and declared above.  ')],
      pair('I', '/', 'We', !isCo), [R(' undertake that ')], pair('I', '/', 'we', !isCo), [R(' ')],
      pair('have delivered', '/', ' will deliver', c.realised),
      [R(' to the authorised dealer named above the ')],
      (fx && inr) ? [R('foreign exchange / Indian Rupees')] : pair('foreign exchange ', '/', ' Indian Rupees', fx || !inr),
      [R(' representing the full value of the ')], pair('goods', '/', 'services', false),
      [R(' exported as above on or before ')],
      [realDate ? R(realDate, 'b') : R('[date]', 'bh')],
      [R(' (i.e. within the period of realisation stipulated by RBI from time to time) in the manner specified in the Regulations made under the Foreign Exchange Management Act, 1999.')]
    );
    var decl2 = [].concat(pair('I', '/', 'We', !isCo),
      [R(' also undertake to submit the documents pertaining to exports declared in this form, to the Authorised Dealer named above, as may be required under the Act.')]);
    var sigParas = [decl, decl2, [R('')]];
    if (isCo) sigParas.push([R('For ' + (clean(e.name) || '[exporter name]'), 'b')]);
    sigParas.push([R('')], [R('')], [R('')]);
    sigParas.push([R('Place: ' + clean(e.place))]);
    sigParas.push([R('Date: ' + (fmtDate(f.signDate) || '____________')), R('          (Signature of Exporter' + (isCo ? ', with company stamp' : '') + ')')]);
    if (clean(e.signatory)) sigParas.push([R('Name: ' + clean(e.signatory) + (clean(e.designation) ? ', ' + clean(e.designation) : ''))]);

    var t4 = { type: 'table', cols: [50, 50], rows: [
      [C(2, [R('3. Applicable for Export under FPO/Couriers')])],
      [C(1, LV('Name of the Foreign post Office/Courier: ', 'Not applicable'), [R('')], LV('Number & date of Parcel receipts: ', 'Not applicable')),
        C(1, [R('')], [R('')], [R('')], [R('Stamp & Signature of Authorised Dealer')])],
      [C(2, [R('4. Declaration by the Exporters (All types of exports)')])],
      [{ span: 2, paras: sigParas }],
      [C(2, [R('5. Space for use of Specified Authority (Custom/SEZ/AD/STPI):')])],
      [C(2, [R('Certified, on the basis of above declaration at 4, that the goods/services described above and the export value^ declared by the exporter in this form is as per the corresponding invoice/gist of invoices submitted and declared by the exporter.')],
        [R('')], [R('')], [R('Date:                                   (Signature of Designated/Authorised officials of Custom /SEZ/ Authorised Dealer/STPI)')])]
    ] };
    blocks.push(t4);
    blocks.push({ type: 'notes', items: [
      '@ Strike out whichever is not applicable.',
      '^ If the full export value is not ascertainable at the time of export, the value which the exporter, having regard to the prevailing market conditions expects to receive on the sale of the goods in overseas market.',
      'Export value may be indicated as nil in case the goods are sent without any consideration.'
    ] });
    return blocks;
  }

  // ---------- HTML renderer ----------
  function esc(s) { return String(s).replace(/[&<>"]/g, function (ch) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]; }); }
  function runsHTML(runs) {
    return runs.map(function (r) {
      var cls = [r.b ? 'b' : '', r.s ? 's' : '', r.h ? 'hl' : ''].filter(Boolean).join(' ');
      var t = esc(r.t) || '&nbsp;';
      return cls ? '<span class="' + cls + '">' + t + '</span>' : t;
    }).join('');
  }
  function renderHTML(blocks) {
    return blocks.map(function (b) {
      if (b.type === 'p') return '<p class="' + (b.align === 'center' ? 'title' : 'annex') + '">' + runsHTML(b.runs) + '</p>';
      if (b.type === 'notes') return '<ol class="notes">' + b.items.map(function (i) { return '<li>' + esc(i) + '</li>'; }).join('') + '</ol>';
      var cg = '<colgroup>' + b.cols.map(function (w) { return '<col style="width:' + w + '%">'; }).join('') + '</colgroup>';
      var body = b.rows.map(function (row) {
        return '<tr>' + row.map(function (cell) {
          return '<td colspan="' + (cell.span || 1) + '">' + cell.paras.map(function (p) { return '<p>' + runsHTML(p) + '</p>'; }).join('') + '</td>';
        }).join('') + '</tr>';
      }).join('');
      return '<table class="' + (b.small ? 'small' : '') + '">' + cg + body + '</table>';
    }).join('');
  }

  // ---------- DOCX renderer ----------
  function renderDocx(blocks) {
    var D = window.docx;
    var PAGE_W = 11906, MARGIN = 680, TW = PAGE_W - 2 * MARGIN;
    var children = [];
    function runs(rs, size) {
      return rs.map(function (r) {
        var o = { text: r.t, bold: r.b, strike: r.s, size: size };
        if (r.h) o.highlight = 'yellow';
        return new D.TextRun(o);
      });
    }
    blocks.forEach(function (b) {
      if (b.type === 'p') {
        children.push(new D.Paragraph({ children: runs(b.runs, b.size ? b.size * 2 : 20), alignment: b.align === 'center' ? D.AlignmentType.CENTER : D.AlignmentType.LEFT, spacing: { after: 80 } }));
        return;
      }
      if (b.type === 'notes') {
        b.items.forEach(function (t, i) { children.push(new D.Paragraph({ children: [new D.TextRun({ text: (i + 1) + '. ' + t, size: 17 })], spacing: { after: 40 }, indent: { left: 360 } })); });
        return;
      }
      var size = b.small ? 14 : 18;
      var widths = b.cols.map(function (p) { return Math.round(TW * p / 100); });
      var rows = b.rows.map(function (row) {
        var col = 0;
        return new D.TableRow({ cantSplit: true, children: row.map(function (cell) {
          var span = cell.span || 1;
          var w = widths.slice(col, col + span).reduce(function (a, x) { return a + x; }, 0);
          col += span;
          return new D.TableCell({
            columnSpan: span,
            width: { size: w, type: D.WidthType.DXA },
            margins: { top: 40, bottom: 40, left: 80, right: 80 },
            children: cell.paras.map(function (p) { return new D.Paragraph({ children: runs(p, size), spacing: { after: 20 } }); })
          });
        }) });
      });
      children.push(new D.Table({ width: { size: TW, type: D.WidthType.DXA }, columnWidths: widths, layout: D.TableLayoutType.FIXED, rows: rows }));
      children.push(new D.Paragraph({ children: [], spacing: { after: 60 } }));
    });
    var doc = new D.Document({
      creator: 'EDF Generator',
      title: 'Export Declaration Form',
      styles: { default: { document: { run: { font: 'Times New Roman', size: 18 } } } },
      sections: [{ properties: { page: { size: { width: PAGE_W, height: 16838 }, margin: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN } } }, children: children }]
    });
    return D.Packer.toBlob(doc);
  }

  // ---------- checks ----------
  var RX = {
    pan: /^[A-Z]{5}[0-9]{4}[A-Z]$/,
    gstin: /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    iec: /^[A-Z0-9]{10}$/,
    ifsc: /^[A-Z]{4}0[A-Z0-9]{6}$/
  };
  function checks(s, c) {
    var out = [];
    function add(level, msg) { out.push({ level: level, msg: msg }); }
    var e = s.exporter, f = s.filing;
    var pan = clean(e.pan).toUpperCase(), gstin = clean(e.gstin).toUpperCase(), iec = clean(e.iec).toUpperCase();
    if (!clean(e.name)) add('err', 'Exporter name is missing.');
    if (!clean(e.address)) add('err', 'Exporter address is missing.');
    if (!iec) add('err', 'IEC is missing. Banks report the EDF against your IEC.');
    else if (!RX.iec.test(iec)) add('err', 'IEC should be exactly 10 letters or digits.');
    if (pan && !RX.pan.test(pan)) add('err', 'PAN format looks wrong (expected AAAAA9999A).');
    if (gstin && !RX.gstin.test(gstin)) add('warn', 'GSTIN format looks wrong (expected 15 characters).');
    if (gstin && pan && gstin.slice(2, 12) !== pan) add('warn', 'The PAN inside your GSTIN does not match the PAN you entered.');
    if (iec && pan && iec === pan) add('info', 'Your IEC equals your PAN. That is normal for IECs issued from 2018 onwards. Older IECs are a separate 10-digit number. Use the one shown on the DGFT portal.');
    if (iec) add('info', 'Keep your IEC active. DGFT requires an online update every year between April and June, or it gets deactivated.');
    if (!clean(s.bank.name)) add('err', 'Bank (AD) name is missing.');
    if (clean(s.bank.ifsc) && !RX.ifsc.test(clean(s.bank.ifsc).toUpperCase())) add('warn', 'IFSC format looks wrong.');
    if (!clean(s.bank.adCode)) add('warn', 'AD code is blank. Ask your branch or relationship manager, or let the bank fill it in.');
    if (!clean(f.description)) add('warn', 'Add an overall description of services.');

    var me = monthEnd(f.month);
    if (!me) add('warn', 'Pick the invoice month this EDF covers.');
    else {
      var due = new Date(me.getTime() + 30 * 86400000);
      var today = new Date(); var todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
      if (todayUTC > due.getTime()) add('warn', 'Filing deadline for ' + monthLabel(f.month) + ' invoices was ' + fmtDate(isoOf(due)) + ' (30 days from month end). File now and expect questions from the bank.');
      else add('info', 'Deadline for ' + monthLabel(f.month) + ' invoices: ' + fmtDate(isoOf(due)) + ' (30 days from month end).');
    }

    if (!c.invs.length) add('err', 'Add at least one invoice.');
    c.invs.forEach(function (x, i) {
      var iv = x.raw, tag = 'Invoice ' + (i + 1) + (clean(iv.no) ? ' (' + clean(iv.no) + ')' : '') + ': ';
      if (!clean(iv.client)) add('err', tag + 'client name is missing.');
      if (!clean(iv.country)) add('err', tag + 'client country is missing.');
      if (!clean(iv.no)) add('err', tag + 'invoice number is missing.');
      if (!iv.date) add('err', tag + 'invoice date is missing.');
      if (isNaN(x.amount) || x.amount <= 0) add('err', tag + 'invoice amount is missing.');
      if (x.cur !== 'INR' && isNaN(x.rate)) add('err', tag + 'enter the INR exchange rate. Use the same rate as in your GST invoice / GSTR-1.');
      if (!isNaN(x.net) && !isNaN(x.amount) && x.net > x.amount) add('err', tag + 'net realisable value is more than the invoice amount.');
      if (x.deduction > 0) add('info', tag + 'net value is ' + x.cur + ' ' + fmtFC(x.deduction) + ' less than the invoice. It is shown as "Other Deduction". Give the bank the reason (for example, overseas bank charges).');
      if (!x.sac) add('warn', tag + 'SAC code is missing. Use the SAC from your GST invoice.');
      if (iv.date && f.month && iv.date.slice(0, 7) !== f.month) add('warn', tag + 'invoice date is outside the selected month. One EDF covers invoices raised in one month.');
      if (iv.date && iv.date < '2026-10-01') add('info', tag + 'dated before 1 Oct 2026. Exports before that date generally fall under the old 2015 rules. File it only if your bank asks.');
      var rec = num(iv.received);
      if (!isNaN(rec) && !isNaN(x.net) && rec < x.net) add('warn', tag + 'received ' + fmtFC(rec) + ' is less than net value ' + fmtFC(x.net) + '. Ask the bank to record the shortfall as bank charges, or reduce the net value.');
    });
    if (c.currencies.length > 1) add('info', 'Invoices are in more than one currency. The INR total adds them up at each invoice\'s rate.');
    if (c.thirdParty) add('warn', 'Third party payer entered. The bank must approve third-party receipts. Keep a document showing the link between the payer and your client.');
    if (f.nature === 'Advance') add('warn', 'Advance receipt: banks usually want a proforma invoice or contract now. The EDF follows when you raise the final invoice. Check with your bank before filing an EDF for an advance.');
    if (f.exportKind === 'Project') add('info', 'Project exports have extra reporting rules. Confirm the format with your bank.');
    if (!clean(f.realisationDate)) add('warn', 'Add the date the money was received, or the date it will be received by.');
    else if (!c.realised) {
      var latest = latestRealisation(c);
      if (latest && f.realisationDate > latest) add('warn', 'The "will deliver by" date is later than the permitted realisation period (' + fmtDate(latest) + ').');
    }
    var errs = out.filter(function (o) { return o.level === 'err'; }).length;
    if (!errs) out.unshift({ level: 'ok', msg: 'No blocking errors. Review the preview before you print.' });
    return out;
  }

  function latestRealisation(c) {
    var dates = c.invs.map(function (x) {
      var d = parseISO(x.raw.date); if (!d) return null;
      return isoOf(addMonths(d, x.cur === 'INR' ? 18 : 15));
    }).filter(Boolean).sort();
    return dates[0] || null;
  }

  // ---------- email ----------
  function emailText(s, c) {
    var e = s.exporter, f = s.filing, bk = s.bank;
    var L = [];
    var nums = c.invs.map(function (x) { return clean(x.raw.no); }).filter(Boolean);
    var sameCur = c.currencies.length === 1;
    var totalNet = c.invs.reduce(function (a, x) { return a + (isNaN(x.net) ? 0 : x.net); }, 0);
    L.push('Subject: Disposal Instructions and EDF: Inward Remittance against Invoice ' + (nums.join(', ') || '[invoice no.]') + ', ' + (clean(e.name) || '[exporter]'));
    L.push('');
    L.push('Dear Team,');
    L.push('');
    L.push('Please process the inward remittance(s) below.');
    L.push('');
    L.push('Account name: ' + clean(e.name));
    if (clean(bk.account)) L.push('Account number: ' + clean(bk.account));
    L.push('Remitter: ' + (c.thirdParty ? clean(f.thirdPartyName) + ' (third party, on behalf of ' + c.clients.join(', ') + ')' : (c.clients.join(', ') || '[client]')));
    c.invs.forEach(function (x) {
      var iv = x.raw;
      var rec = num(iv.received);
      L.push('Invoice ' + (clean(iv.no) || '[no.]') + ' dated ' + (fmtDate(iv.date) || '[date]') + ': ' + x.cur + ' ' + fmtFC(x.amount) +
        (!isNaN(rec) ? '. Received: ' + x.cur + ' ' + fmtFC(rec) + (rec >= x.net ? ' (full value, no deductions)' : '') : ''));
      if (!isNaN(rec) && rec < x.net) L.push('The difference of ' + x.cur + ' ' + fmtFC(round2(x.net - rec)) + ' is overseas and intermediary bank charges. Please record it as bank charges against this invoice.');
    });
    if (c.invs.length > 1 && sameCur) L.push('Total: ' + c.currencies[0] + ' ' + fmtFC(totalNet));
    if (clean(f.realisationDate) && c.realised) L.push('Date of receipt: ' + fmtDate(f.realisationDate));
    L.push('');
    L.push('Export Type: ' + f.exportType);
    L.push('Nature of Receipt: ' + (f.nature === 'Advance' ? 'Advance (services yet to be rendered)' : 'Non-Advance (services already rendered)'));
    L.push('Type of Export: ' + (f.exportKind === 'Project' ? 'Project Export' : 'Regular Export'));
    if (clean(f.purposeCode)) L.push('Purpose code: ' + clean(f.purposeCode).toUpperCase());
    if (clean(e.iec)) L.push('IEC: ' + clean(e.iec).toUpperCase());
    L.push('');
    L.push('Please convert the proceeds, credit them to the above account and issue the e-FIRA.');
    L.push('');
    L.push('Attached:');
    L.push('1. EDF, signed and stamped');
    L.push('2. Export invoice(s): ' + (nums.join(', ') || '[invoice no.]'));
    var contracts = c.invs.map(function (x) { return clean(x.raw.contract); }).filter(function (v, i, a) { return v && a.indexOf(v) === i; });
    if (contracts.length) L.push('3. Contract / agreement: ' + contracts.join('; '));
    L.push('');
    L.push('Regards,');
    L.push(clean(e.signatory) || '[name]');
    if (clean(e.designation)) L.push(clean(e.designation));
    L.push(clean(e.name));
    return L.join('\n');
  }

  // ---------- UI ----------
  var INV_FIELDS = [
    ['client', 'Client (service recipient) name', 'span2'],
    ['address', 'Client address', 'span2', 'textarea'],
    ['country', 'Country'],
    ['no', 'Invoice number'],
    ['date', 'Invoice date', '', 'date'],
    ['currency', 'Currency', '', 'currency'],
    ['amount', 'Invoice amount (foreign currency)', '', 'number'],
    ['net', 'Net realisable value (blank = same as amount)', '', 'number'],
    ['rate', 'Exchange rate, INR per unit (as in GSTR-1)', '', 'number'],
    ['received', 'Amount received (for the email, optional)', '', 'number'],
    ['contract', 'Contract no. and date', 'span2'],
    ['description', 'Description (blank = overall description)', 'span2'],
    ['sac', 'SAC (blank = default)'],
    ['payment', 'Nature of payment', '', 'payment'],
    ['remarks', 'Remarks (blank = auto)', 'span2']
  ];
  var CURRENCIES = ['USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED', 'CHF', 'JPY', 'NZD', 'SEK', 'HKD', 'INR'];

  function renderInvoices() {
    var list = $('#invoiceList');
    list.innerHTML = '';
    state.invoices.forEach(function (iv, i) {
      var box = document.createElement('div');
      box.className = 'inv';
      var head = '<div class="inv-head"><strong>Invoice ' + (i + 1) + '</strong><span>' +
        '<button type="button" class="btn small" data-act="dup" data-i="' + i + '">Duplicate</button> ' +
        '<button type="button" class="btn small danger" data-act="del" data-i="' + i + '">Remove</button></span></div>';
      var grid = '<div class="grid">';
      INV_FIELDS.forEach(function (fd) {
        var key = fd[0], label = fd[1], cls = fd[2] || '', kind = fd[3] || 'text';
        var attrs = ' data-inv="' + i + '" data-key="' + key + '"';
        var ctl;
        if (kind === 'textarea') ctl = '<textarea rows="2"' + attrs + '></textarea>';
        else if (kind === 'payment') ctl = '<select' + attrs + '><option value="periodical">Periodical (monthly / T&amp;M)</option><option value="milestone">Milestone</option><option value="advance">Advance</option><option value="others">Others</option></select>';
        else if (kind === 'currency') ctl = '<input list="curList"' + attrs + ' maxlength="3">';
        else if (kind === 'date') ctl = '<input type="date"' + attrs + '>';
        else if (kind === 'number') ctl = '<input inputmode="decimal"' + attrs + '>';
        else ctl = '<input' + attrs + '>';
        grid += '<label class="' + cls + '">' + label + ctl + '</label>';
      });
      grid += '<div class="inv-calc" data-calc="' + i + '"></div></div>';
      box.innerHTML = head + grid;
      list.appendChild(box);
      $all('[data-inv]', box).forEach(function (el) { el.value = iv[el.getAttribute('data-key')] || ''; if (el.tagName === 'SELECT' && !el.value) el.selectedIndex = 0; });
    });
    if (!$('#curList')) {
      var dl = document.createElement('datalist'); dl.id = 'curList';
      dl.innerHTML = CURRENCIES.map(function (c) { return '<option value="' + c + '">'; }).join('');
      document.body.appendChild(dl);
    }
  }

  function fillForm() {
    $all('[data-path]').forEach(function (el) {
      var v = getPath(state, el.getAttribute('data-path'));
      if (el.type === 'checkbox') el.checked = !!v; else el.value = v == null ? '' : v;
    });
    renderInvoices();
  }

  var timer = null;
  function refresh() {
    var c = compute(state);
    $('#preview').innerHTML = renderHTML(buildModel(state, c));
    var ck = checks(state, c);
    $('#checks').innerHTML = ck.map(function (x) { return '<li class="' + x.level + '">' + esc(x.msg) + '</li>'; }).join('');
    $('#emailText').textContent = emailText(state, c);
    c.invs.forEach(function (x) {
      var el = document.querySelector('[data-calc="' + x.i + '"]');
      if (el) el.textContent = isNaN(x.inr) ? 'INR value: enter amount and exchange rate.' : 'INR value: Rs ' + fmtINR(x.inr) + (x.deduction > 0 ? '. Deduction: ' + x.cur + ' ' + fmtFC(x.deduction) : '');
    });
    if (autosaveOn()) { try { localStorage.setItem(LS_DRAFT, JSON.stringify(state)); } catch (err) { /* storage unavailable */ } }
  }
  function scheduleRefresh() { clearTimeout(timer); timer = setTimeout(refresh, 120); }

  function onInput(ev) {
    var el = ev.target;
    if (el.hasAttribute('data-path')) {
      setPath(state, el.getAttribute('data-path'), el.type === 'checkbox' ? el.checked : el.value);
      scheduleRefresh();
    } else if (el.hasAttribute('data-inv')) {
      var i = +el.getAttribute('data-inv'); var key = el.getAttribute('data-key');
      var v = el.value;
      if (key === 'currency') v = v.toUpperCase();
      state.invoices[i][key] = v;
      scheduleRefresh();
    }
  }

  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }
  function slug(s) { return (clean(s) || 'exporter').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40); }
  function fileBase() { return 'EDF_' + slug(state.exporter.name) + '_' + (state.filing.month || 'month'); }

  function autosaveOn() { try { return localStorage.getItem(LS_AUTOSAVE) === '1'; } catch (err) { return false; } }

  function loadState(obj) {
    var data = obj && obj.app === APP_ID && obj.data ? obj.data : obj;
    var fresh = deepMerge(defaults(), data || {});
    fresh.invoices = (Array.isArray(fresh.invoices) && fresh.invoices.length ? fresh.invoices : [blankInvoice()])
      .map(function (iv) { return deepMerge(blankInvoice(), iv); });
    state = fresh;
    fillForm(); refresh();
  }

  function nextMonth() {
    var m = /^(\d{4})-(\d{2})$/.exec(state.filing.month || '');
    var base = m ? new Date(Date.UTC(+m[1], +m[2], 1)) : new Date(Date.UTC(new Date().getFullYear(), new Date().getMonth(), 1));
    state.filing.month = isoOf(base).slice(0, 7);
    state.filing.realisationDate = ''; state.filing.signDate = ''; state.filing.formNo = '';
    state.invoices = state.invoices.map(function (iv) {
      var n = blankInvoice();
      ['client', 'address', 'country', 'currency', 'contract', 'description', 'sac', 'payment'].forEach(function (k) { n[k] = iv[k]; });
      return n;
    });
    fillForm(); refresh();
    toast('Ready for ' + monthLabel(state.filing.month) + '. Profile and clients kept.');
  }

  function sample() {
    loadState({
      exporter: { name: 'EXAMPLE SOFTWORKS PRIVATE LIMITED', address: 'Unit 101, Example Tower, Sector 1\nGurugram, Haryana 122001, India',
        iec: 'AAACE1234F', gstin: '06AAACE1234F1Z5', pan: 'AAACE1234F', entityType: 'company', category: 'others',
        categoryOther: 'Software services exporter, not registered with STPI / SEZ / EOU', signatory: 'A. Sample', designation: 'Director', place: 'Gurugram' },
      bank: { name: 'Example Bank Limited, Gurgaon Branch', address: 'Ground Floor, Example Plaza, Sector 2\nGurugram, Haryana 122002', ifsc: 'EXMP0001234', adCode: '', account: '000123456789' },
      filing: { month: '2026-10', exportType: 'Software', nature: 'Non-Advance', exportKind: 'Regular', delivery: 'Internet', realisation: 'Others',
        description: 'Software development and IT consulting services, delivered remotely over the internet', sac: '998314', purposeCode: 'P0802',
        realised: 'yes', realisationDate: '2026-11-12', fill2A: true },
      invoices: [
        { client: 'Northwind Analytics Inc', address: '100 Example Street\nAustin, TX 78701', country: 'United States', no: 'EXP-101', date: '2026-10-31',
          currency: 'USD', amount: '12000', net: '', rate: '88.50', received: '11975', contract: 'Master Services Agreement dated 01-04-2025', payment: 'periodical' },
        { client: 'Contoso Pty Ltd', address: '1 Sample Road\nMelbourne VIC 3000', country: 'Australia', no: 'EXP-102', date: '2026-10-31',
          currency: 'USD', amount: '4500', net: '', rate: '88.50', received: '4500', contract: 'Statement of Work dated 15-06-2026', payment: 'milestone' }
      ]
    });
    toast('Sample data loaded (fictional).');
  }

  function init() {
    var form = $('#edfForm');
    form.addEventListener('input', onInput);
    form.addEventListener('change', onInput);
    form.addEventListener('submit', function (e) { e.preventDefault(); });

    $('#invoiceList').addEventListener('click', function (ev) {
      var b = ev.target.closest('button[data-act]'); if (!b) return;
      var i = +b.getAttribute('data-i');
      if (b.getAttribute('data-act') === 'del') {
        state.invoices.splice(i, 1);
        if (!state.invoices.length) state.invoices.push(blankInvoice());
      } else {
        var copy = JSON.parse(JSON.stringify(state.invoices[i])); copy.no = ''; copy.received = '';
        state.invoices.splice(i + 1, 0, copy);
      }
      renderInvoices(); refresh();
    });
    $('#btnAddInvoice').addEventListener('click', function () {
      var n = blankInvoice();
      var last = state.invoices[state.invoices.length - 1];
      if (last) { n.currency = last.currency; n.date = last.date; n.rate = last.rate; }
      state.invoices.push(n); renderInvoices(); refresh();
    });
    $('#btnSuggestDate').addEventListener('click', function () {
      var c = compute(state);
      if (c.realised) { toast('Proceeds already received: enter the date the bank received them.'); return; }
      var d = latestRealisation(c);
      if (!d) { toast('Enter invoice dates first.'); return; }
      state.filing.realisationDate = d; fillForm(); refresh();
    });

    $('#btnExport').addEventListener('click', function () {
      var payload = { app: APP_ID, version: SCHEMA_VERSION, savedAt: new Date().toISOString(), data: state };
      download(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), fileBase() + '.json');
    });
    $('#btnImport').addEventListener('click', function () { $('#fileImport').click(); });
    $('#fileImport').addEventListener('change', function (ev) {
      var file = ev.target.files && ev.target.files[0]; if (!file) return;
      var rd = new FileReader();
      rd.onload = function () {
        try { loadState(JSON.parse(rd.result)); toast('Imported ' + file.name + '. Use "Start next month" to roll forward.'); }
        catch (err) { toast('Could not read that file. Is it a JSON export from this tool?'); }
        ev.target.value = '';
      };
      rd.readAsText(file);
    });
    $('#btnNextMonth').addEventListener('click', nextMonth);
    $('#btnSample').addEventListener('click', sample);
    $('#btnReset').addEventListener('click', function () {
      if (!window.confirm('Clear all fields? Export JSON first if you want to keep them.')) return;
      try { localStorage.removeItem(LS_DRAFT); } catch (err) { /* ignore */ }
      loadState(defaults());
    });
    $('#btnPrint').addEventListener('click', function () { refresh(); window.print(); });
    $('#btnDocx').addEventListener('click', function () {
      refresh();
      if (!window.docx) { toast('Word export library did not load. Use Print / Save as PDF.'); return; }
      renderDocx(buildModel(state, compute(state))).then(function (blob) { download(blob, fileBase() + '.docx'); toast('Word file downloaded.'); })
        .catch(function () { toast('Could not build the Word file. Use Print / Save as PDF.'); });
    });
    $('#btnCopyEmail').addEventListener('click', function () {
      var txt = $('#emailText').textContent;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { toast('Email copied.'); }, function () { toast('Copy failed. Open the draft below and copy it manually.'); });
      } else { toast('Open the draft below and copy it manually.'); }
    });

    var auto = $('#optAutosave');
    auto.checked = autosaveOn();
    auto.addEventListener('change', function () {
      try {
        if (auto.checked) { localStorage.setItem(LS_AUTOSAVE, '1'); localStorage.setItem(LS_DRAFT, JSON.stringify(state)); toast('Draft will be kept in this browser.'); }
        else { localStorage.removeItem(LS_AUTOSAVE); localStorage.removeItem(LS_DRAFT); toast('Browser draft deleted.'); }
      } catch (err) { auto.checked = false; toast('This browser blocks local storage. Use Export JSON instead.'); }
    });

    var restored = false;
    if (autosaveOn()) {
      try { var d = localStorage.getItem(LS_DRAFT); if (d) { loadState(JSON.parse(d)); restored = true; } } catch (err) { /* ignore */ }
    }
    if (!restored) {
      var now = new Date(); var prev = new Date(Date.UTC(now.getFullYear(), now.getMonth() - 1, 1));
      state.filing.month = isoOf(prev).slice(0, 7);
      fillForm(); refresh();
    }
  }

  // expose pure functions for tests
  window.EDFGen = { compute: compute, buildModel: buildModel, rupeesInWords: rupeesInWords, checks: checks, emailText: emailText, loadState: loadState, getState: function () { return state; } };
  document.addEventListener('DOMContentLoaded', init);
})();
