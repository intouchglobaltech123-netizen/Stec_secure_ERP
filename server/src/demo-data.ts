// Demo data for showing the ERP (Step 3): ~10 of every kind of record — staff, salaries and leave,
// suppliers, products and stock, customers (two outside Tamil Nadu for IGST), enquiries, quotations,
// service and installation jobs at every stage, challans, invoices, payments, a credit note, repairs —
// created through the ERP's own actions with dates spread over July–October 2026, so numbering, GST,
// stock and payroll all add up.
//
//   node server-dist/demo-data.js        (after `npm run build`; uses DATABASE_URL like the server)
//
// Refuses a database that already has customers, products, jobs or invoices. The server keeps the data
// in memory, so restart it afterwards (on Railway: `railway ssh` to run this, then `railway restart`).
// Demo staff get no login: the CEO sets their PINs in Settings → Staff Accounts.
import fs from 'node:fs';
import path from 'node:path';
import { connectDatabase } from './db';
import { migrate } from './migrate';
import { Store, normalizePhone } from './store';
import { extractPhotos } from './photos';
import { makeEnv, ErpState } from '../../src/lib/erp/core';
import { ACTIONS } from '../../src/lib/erp/actions';
import { withStaffCodes } from '../../src/lib/staff-code';
import { COMPANY_DETAILS, User } from '../../src/lib/stecsecure-types';

const PHOTOS = path.resolve(process.cwd(), 'server', 'demo');

// ---------- helpers ----------
function gstin(prefix14: string) {
  const C = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const v = C.indexOf(prefix14[i]) * (i % 2 ? 2 : 1);
    sum += Math.floor(v / 36) + (v % 36);
  }
  return prefix14 + C[(36 - (sum % 36)) % 36];
}
// India time on a day: at('2026-07-03', 10, 30)
const at = (date: string, h = 10, m = 0) => new Date(`${date}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+05:30`);
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

type Event = { when: Date; seq: number; label: string; fn: () => Promise<void> };
const events: Event[] = [];
let seq = 0;
const on = (when: Date, label: string, fn: () => Promise<void>) => events.push({ when, seq: seq++, label, fn });

async function main() {
  const db = await connectDatabase();
  await migrate(db);
  const store = new Store(db);
  await store.init();
  const s0 = store.state;
  if ((s0.customers.length || s0.jobs.length || s0.invoices.length || s0.products.length)) {
    console.error('[demo] this database already has business data — nothing loaded.');
    await db.close();
    process.exit(1);
  }
  const foundCeo = s0.users.find((u) => u.role === 'CEO');
  if (!foundCeo) throw new Error('No CEO account in this database.');
  const ceo: User = foundCeo;
  console.log(`[demo] loading as ${ceo.name} (${ceo.phone})`);

  // Runs one ERP action as `actor` at a given time and saves it
  async function run<T = any>(name: keyof typeof ACTIONS, args: unknown, actor: User, when: Date): Promise<T> {
    let result: unknown;
    if (when.getTime() > Date.now()) when = new Date(Date.now() - 60_000);
    await store.commit((state) => {
      const out = (ACTIONS[name] as any)(state, makeEnv(actor, when), args) as { state: ErpState; result: unknown };
      result = out.result;
      return out.state;
    });
    return result as T;
  }
  const st = () => store.state;

  // ---------- staff (no logins) ----------
  const staffSpec: [string, User['role'], string][] = [
    ['Arun Kumar', 'TECHNICIAN', '9003224455'],
    ['Manikandan S', 'TECHNICIAN', '9003336677'],
    ['Dinesh Babu', 'TECHNICIAN', '9003448899'],
    ['Karthik Raja', 'TECHNICIAN', '9003551122'],
    ['Prakash M', 'TECHNICIAN', '9003662233'],
    ['Sathish Kumar', 'TECHNICIAN', '9003773344'],
    ['Vignesh R', 'TECHNICIAN', '9003884455'],
    ['Gowtham P', 'TECHNICIAN', '9003995566'],
    ['Priya Ramesh', 'MANAGER', '9003112233'],
    ['Kavitha Senthil', 'MANAGER', '9003117788'],
  ];
  const newUsers: User[] = staffSpec.map(([name, role, phone], i) => ({
    id: `usr-demo-${String(i + 1).padStart(2, '0')}`,
    name,
    role,
    phone: normalizePhone(phone),
  }));
  await store.commit((s) => ({ ...s, users: withStaffCodes([...s.users, ...newUsers]) }));
  const U = Object.fromEntries(st().users.map((u) => [u.name, u])) as Record<string, User>;
  const T = ['Arun Kumar', 'Manikandan S', 'Dinesh Babu', 'Karthik Raja', 'Prakash M', 'Sathish Kumar', 'Vignesh R', 'Gowtham P'].map((n) => U[n]);
  const billing = U['Priya Ramesh'];

  // ---------- photos (stored once, used on every job) ----------
  const dataUrl = (f: string) => `data:image/jpeg;base64,${fs.readFileSync(path.join(PHOTOS, f)).toString('base64')}`;
  const beforePhoto = (await extractPhotos(db, dataUrl('before.jpg'), ceo.id)) as string;
  const afterPhoto = (await extractPhotos(db, dataUrl('after.jpg'), ceo.id)) as string;

  const bank = {
    bankName: COMPANY_DETAILS.bank.bankName,
    accountNumber: COMPANY_DETAILS.bank.accountNumber,
    ifscCode: COMPANY_DETAILS.bank.ifscCode,
    branch: COMPANY_DETAILS.bank.branch,
    accountType: COMPANY_DETAILS.bank.accountType,
  };

  // ---------- pay settings ----------
  const pay: [User, number][] = [
    [ceo, 0],
    [T[0], 18000], [T[1], 22000], [T[2], 16000], [T[3], 17000], [T[4], 15000], [T[5], 16500], [T[6], 14000], [T[7], 14500],
    [billing, 20000], [U['Kavitha Senthil'], 16000],
  ];
  on(at('2026-07-01', 9), 'pay settings', async () => {
    for (const [u, salary] of pay) {
      const tech = u.role === 'TECHNICIAN';
      await run('setPayProfile', {
        userId: u.id,
        monthlySalary: salary,
        serviceIncentive: tech ? 150 : 0,
        installationIncentive: tech ? 500 : 0,
        paidLeavePerMonth: u.role === 'CEO' ? 0 : 1,
        casualLeavePerMonth: u.role === 'CEO' ? 0 : 1,
      }, ceo, at('2026-07-01', 9));
    }
  });

  // ---------- suppliers & products & stock ----------
  const vendorSpec = [
    ['Kongu Security Distributors', '9443012345', '45, Brough Road, Erode - 638001', '33AAKFK4521M1Z', 'Mr. Senthil'],
    ['Coimbatore CCTV Wholesale', '9442098765', '112, Cross Cut Road, Gandhipuram, Coimbatore - 641012', '33AAHCC7781K1Z', 'Ravi'],
    ['Chennai Access Systems', '9840112233', '18, Mount Road, Chennai - 600002', '33AACCA4410P1Z', 'Mr. Joseph'],
    ['Bengaluru Gate Motors', '9845012345', '7, Peenya Industrial Area, Bengaluru - 560058', '29AABCB6620G1Z', 'Mr. Naveen'],
    ['Salem Electricals', '9443367700', '22, Omalur Main Road, Salem - 636009', '33AAFFS3392E1Z', 'Mr. Murugan'],
    ['Tiruppur Smart Home Traders', '9443500112', '9, Avinashi Road, Tiruppur - 641602', '33AAGFT8812H1Z', 'Mrs. Revathi'],
    ['Madurai Alarm Systems', '9443655443', '41, Bypass Road, Madurai - 625010', '33AAHFM2209J1Z', 'Mr. Pandian'],
    ['Erode Cable House', '9443711223', '3, Nethaji Road, Erode - 638001', '33AAICE5561K1Z', 'Mr. Kannan'],
    ['Hosur Biometric Solutions', '9443899887', '15, SIPCOT Phase II, Hosur - 635109', '33AAJCH7781L1Z', 'Mr. Vasanth'],
    ['Kochi Intercom Distributors', '9847012211', '27, MG Road, Ernakulam - 682016', '32AAKCK4432M1Z', 'Mr. Thomas'],
  ];
  const V: string[] = [];
  const productSpec: [string, string, string, string, number, number, number, string, number][] = [
    // name, category, hsn, unit, rate, cost, count, serial prefix, vendor index
    ['CP PLUS 2.4MP Full HD Bullet Camera', 'CCTV', '85258090', 'Nos', 2400, 1750, 14, 'CPB24-26', 0],
    ['CP PLUS 2.4MP Dome Camera', 'CCTV', '85258090', 'Nos', 2200, 1600, 14, 'CPD24-26', 0],
    ['Hikvision 8-Channel DVR', 'CCTV', '85219090', 'Nos', 5200, 4100, 6, 'HKD8-26', 1],
    ['Hikvision 4MP IP Bullet Camera', 'CCTV', '85258090', 'Nos', 4800, 3600, 8, 'HKIP4-26', 1],
    ['Seagate 1TB Surveillance Hard Disk', 'CCTV', '84717020', 'Nos', 3600, 2900, 8, 'ST1TB-ZV', 1],
    ['eSSL Face Attendance Terminal', 'Biometric & Access Control', '84718000', 'Nos', 9500, 7400, 5, 'ESSLF-26', 8],
    ['Automatic Swing Gate Motor Kit', 'Gate Automation', '85015290', 'Set', 38000, 29500, 3, 'SGM-26', 3],
    ['7-inch Video Door Phone', 'Intercom', '85176290', 'Set', 7800, 5900, 6, 'VDP7-26', 9],
    ['Wireless Burglar Alarm Panel', 'Burglar Alarm System', '85311010', 'Set', 12500, 9500, 4, 'WBA-26', 6],
    ['Smart Wi-Fi Touch Switch (4 gang)', 'Home Automations', '85365090', 'Nos', 3200, 2300, 12, 'SWT4-26', 5],
  ];
  const P: Record<string, string> = {};
  on(at('2026-07-01', 9, 30), 'suppliers, products, stock', async () => {
    for (const [name, phone, address, g, contact] of vendorSpec) {
      const v = await run('addVendor', { name, phone, address, gstin: gstin(g), contactPerson: contact }, ceo, at('2026-07-01', 9, 30));
      V.push(v.id);
    }
    for (const [name, category, hsnSac, unit, defaultRate, cost, count, prefix, vi] of productSpec) {
      const p = await run('addProduct', { name, category, hsnSac, unit, defaultRate, gstRate: 18 }, ceo, at('2026-07-01', 9, 40));
      P[name] = p.id;
      // Most stock arrives in July, a top-up in September
      const first = Math.ceil(count * 0.7);
      const serials = Array.from({ length: count }, (_, i) => `${prefix}-${String(i + 1).padStart(4, '0')}`);
      await run('stockInSerials', { productId: p.id, serialNumbers: serials.slice(0, first), vendorId: V[vi], purchaseCost: cost, purchaseDate: '2026-07-01' }, ceo, at('2026-07-01', 10));
      if (first < count) on(at('2026-09-02', 11), `restock ${name}`, async () => {
        await run('stockInSerials', { productId: p.id, serialNumbers: serials.slice(first), vendorId: V[vi], purchaseCost: cost, purchaseDate: '2026-09-02' }, ceo, at('2026-09-02', 11));
      });
    }
  });

  // ---------- customers ----------
  // [added on, customer] — each one before their first enquiry or job
  const customerSpec: [string, Record<string, unknown> & { name: string }][] = [
    ['2026-07-02', { name: 'Dr. Kavitha Children Clinic', phone: '9894456123', address: '22, Bus Stand Road, Perundurai - 638052', contactPerson: 'Dr. Kavitha', stateCode: '33', amcActive: true, amcRenewalDate: '2026-11-05' }],
    ['2026-07-06', { name: 'Hotel Kongu Residency', phone: '9443556677', address: '86, Brough Road, Erode - 638001', gstin: gstin('33AAGFH3301C1Z'), contactPerson: 'Mr. Selvam (Manager)' }],
    ['2026-07-10', { name: 'Mr. Ramesh Residence', phone: '9786501234', address: '7, Kamarajar Street, Gobichettipalayam - 638452', stateCode: '33' }],
    ['2026-07-15', { name: 'Velan Engineering College Hostel', phone: '9865023456', address: 'Thindal, Erode - 638009', contactPerson: 'Warden', stateCode: '33', amcActive: true, amcRenewalDate: '2026-11-20' }],
    ['2026-07-29', { name: 'Sri Annapoorna Textiles', phone: '9842712345', address: '128, Perundurai Road, Erode - 638011', gstin: gstin('33AAKFS2210B1Z'), contactPerson: 'Mr. K. Senthilkumar', email: 'accounts@annapoornatex.in' }],
    ['2026-08-05', { name: 'Green Valley Apartments Association', phone: '9442011223', address: 'Green Valley, Solar, Erode - 638002', contactPerson: 'Mr. Balu (Secretary)', stateCode: '33', amcActive: true, amcRenewalDate: '2026-12-15' }],
    ['2026-08-12', { name: 'Palakkad Spices Exports', phone: '9846033221', address: '5, Industrial Estate, Kanjikode, Palakkad - 678621', gstin: gstin('32AAICP5521F1Z'), contactPerson: 'Mr. Unnikrishnan', email: 'office@palakkadspices.in' }],
    ['2026-08-20', { name: 'Lakshmi Agro Foods Pvt Ltd', phone: '9900112233', address: 'Plot 18, KIADB Industrial Area, Hosur Road, Bengaluru - 560099', gstin: gstin('29AABCL7788Q1Z'), contactPerson: 'Mr. Prakash (Admin)', email: 'admin@lakshmiagro.in' }],
    ['2026-08-27', { name: 'Bhavani Kumaran Silk House', phone: '9443367890', address: '54, Mettur Road, Bhavani - 638301', gstin: gstin('33AAFFB6612L1Z'), contactPerson: 'Mr. Kumaran' }],
    ['2026-09-01', { name: 'Sakthi Supermarket', phone: '9443822110', address: '14, Kumaran Road, Tiruppur - 641601', gstin: gstin('33AAHFS9921D1Z'), contactPerson: 'Mr. Sakthivel' }],
  ];
  const C: Record<string, string> = {};
  for (const [day, c] of customerSpec) {
    on(at(day, 10, 30), `customer ${c.name}`, async () => {
      const made = await run('addCustomer', c, billing, at(day, 10, 30));
      C[c.name] = made.id;
    });
  }

  // ---------- helpers for jobs ----------
  const line = (productName: string, qty: number) => {
    const p = productSpec.find((x) => x[0] === productName)!;
    return { itemName: p[0], description: '', hsnSac: p[2], gstRate: 18, qty, rate: p[4], amount: 0, cgst: 0, sgst: 0, total: 0 };
  };
  const labour = (name: string, rate: number) => ({ itemName: name, description: '', hsnSac: '998719', gstRate: 18, qty: 1, rate, amount: 0, cgst: 0, sgst: 0, total: 0 });
  const freeUnits = (productName: string, n: number) =>
    st().serialUnits.filter((u) => u.productId === P[productName] && u.status === 'IN_STOCK').slice(0, n).map((u) => u.id);

  type Stage = 'ASSIGNED' | 'IN_PROGRESS' | 'ON_HOLD' | 'AWAITING' | 'CLOSED';
  interface JobPlan {
    type: 'SERVICE' | 'INSTALLATION';
    day: string; // created
    customer: string;
    category: string;
    contract: 'WARRANTY' | 'AMC' | 'SERVICE_CALL' | 'OTHERS';
    team: User[]; // first is the lead
    problem: string;
    stage: Stage;
    serviceAmount: number;
    use?: [string, number][]; // products used
    holdReason?: string; // a hold during the work
    action?: string;
    pay?: { option: 'FULL' | 'PARTIAL' | 'NOTHING'; amount?: number; mode: 'UPI' | 'CASH' | 'NEFT' | 'CHEQUE'; ref?: string };
    quotation?: { lines: ReturnType<typeof line>[]; advance?: number; challan?: boolean; enquiry?: string };
  }

  async function workJob(plan: JobPlan, jobId: string) {
    const lead = plan.team[0];
    const start = addDays(plan.day, 1);
    if (plan.stage === 'ASSIGNED') return;
    on(at(start, 10), `start ${jobId}`, async () => {
      await run('startJob', { jobId, beforePhotoUrl: beforePhoto }, lead, at(start, 10));
      for (const [name, qty] of plan.use ?? []) {
        await run('addJobProductUsage', { jobId, productId: P[name], quantity: qty, serialUnitIds: freeUnits(name, qty) }, lead, at(start, 11));
      }
    });
    if (plan.holdReason) {
      on(at(start, 12), `hold ${jobId}`, async () => {
        await run('raiseHold', { jobId, reason: plan.holdReason }, lead, at(start, 12));
      });
      if (plan.stage !== 'ON_HOLD') {
        on(at(addDays(start, 1), 9, 30), `resume ${jobId}`, async () => {
          const hold = st().holdEvents.find((h) => h.jobId === jobId && h.status === 'OPEN');
          if (hold) await run('resolveHoldEvent', { holdId: hold.id }, lead, at(addDays(start, 1), 9, 30));
        });
      }
    }
    if (plan.stage === 'IN_PROGRESS' || plan.stage === 'ON_HOLD') return;
    const done = plan.holdReason ? addDays(start, 1) : start;
    on(at(done, 14, 30), `complete ${jobId}`, async () => {
      await run('completeJob', {
        jobId,
        afterPhotoUrl: afterPhoto,
        serviceAmount: plan.serviceAmount,
        serviceGstChoice: 'GST',
        actionTaken: plan.action || 'Work completed and tested with the customer.',
      }, lead, at(done, 14, 30));
    });
    if (plan.stage === 'AWAITING') return;
    on(at(done, 15, 10), `sign-off ${jobId}`, async () => {
      const otp = st().otpVerifications.find((o) => o.jobId === jobId);
      await run('verifyJobOtp', { jobId, enteredCode: otp!.otpCode }, lead, at(done, 15, 10));
      const inv = st().invoices.find((i) => i.linkedJobId === jobId && i.status !== 'CANCELLED');
      if (inv && plan.pay) {
        const due = inv.balanceDue;
        const amount = plan.pay.option === 'FULL' ? due : plan.pay.option === 'PARTIAL' ? Math.min(due, plan.pay.amount ?? Math.round(due / 2)) : 0;
        await run('recordPaymentAfterOtp', {
          invoiceId: inv.id,
          customerNumber: inv.customerNumber,
          statusOption: plan.pay.option,
          amountReceived: amount,
          paymentMode: plan.pay.mode,
          referenceNo: plan.pay.ref,
        }, lead, at(done, 15, 15));
      }
    });
  }

  function planJob(plan: JobPlan) {
    let quotationId: string | undefined;
    let enquiryId: string | undefined;
    if (plan.quotation) {
      // Enquiry → quotation → accepted with an advance → enquiry approved, in the days before the job
      const qp = plan.quotation;
      const qDay = addDays(plan.day, -4);
      if (qp.enquiry) {
        on(at(addDays(plan.day, -6), 11), `enquiry ${plan.customer}`, async () => {
          const cust = st().customers.find((c) => c.id === C[plan.customer])!;
          const enq = await run('createEnquiry', {
            customerName: cust.name, customerPhone: cust.phone, customerAddress: cust.address, customerId: cust.id,
            enquiryType: plan.type, category: plan.category, source: qp.enquiry, createdByUserId: billing.id,
            description: plan.problem,
          }, billing, at(addDays(plan.day, -6), 11));
          enquiryId = enq.id;
          await run('addEnquiryFollowUpNote', { enquiryId: enq.id, noteText: 'Site visit done, measurements taken.' }, billing, at(addDays(plan.day, -5), 17));
        });
      }
      on(at(qDay, 12), `quotation ${plan.customer}`, async () => {
        const q = await run('createQuotation', {
          customerNumber: C[plan.customer], date: qDay, validityDays: 15, enquiryId, lineItems: qp.lines,
          termsAndConditions: '1. 50% advance with order, balance on completion.\n2. 1-year warranty on hardware.',
          totalAmount: 0, totalCgst: 0, totalSgst: 0, roundOff: 0, grandTotal: 0, bankDetails: bank, status: 'SENT',
        }, billing, at(qDay, 12));
        quotationId = q.id;
      });
      on(at(addDays(qDay, 2), 10), `accepted ${plan.customer}`, async () => {
        const q = await run('setQuotationStatus', { quotationId, status: 'ACCEPTED' }, billing, at(addDays(qDay, 2), 10));
        if (qp.advance) {
          const advance = Math.round((q.grandTotal * qp.advance) / 100 / 100) * 100;
          await run('recordAdvance', { quotationId, amount: advance, paymentMode: 'NEFT', referenceNo: `UTR ${String(q.grandTotal * 7919).slice(0, 10)}`, date: addDays(qDay, 2) }, billing, at(addDays(qDay, 2), 11));
        }
        if (enquiryId) await run('approveEnquiry', { enquiryId }, ceo, at(addDays(qDay, 2), 12));
      });
    }
    on(at(plan.day, 12), `job ${plan.customer}`, async () => {
      const job = await run('createJob', {
        type: plan.type, category: plan.category, customerNumber: C[plan.customer], customerStatus: plan.contract,
        assignedTeam: plan.team.map((u) => u.id), teamLeadUserId: plan.team[0].id, serviceAmount: plan.serviceAmount,
        taxable: true, quotationId, enquiryId, problemReported: plan.problem, createdByUserId: billing.id,
        scheduledFor: `${addDays(plan.day, 1)}T10:00`, siteContactName: st().customers.find((c) => c.id === C[plan.customer])?.contactPerson || 'Owner',
        siteContactPhone: st().customers.find((c) => c.id === C[plan.customer])?.phone,
      }, billing, at(plan.day, 12));
      if (enquiryId) await run('convertEnquiryToJob', { enquiryId, jobId: job.id }, billing, at(plan.day, 12, 5));
      if (quotationId && plan.quotation?.challan) {
        // Delivery challan with the exact serial numbers going to site
        const dc = await run('convertQuotationToDeliveryChallan', { quotationId, jobId: job.id }, billing, at(plan.day, 15));
        const lines = dc.lineItems.map((l: any) => (l.productId ? { ...l, serialUnitIds: st().serialUnits.filter((u) => u.productId === l.productId && u.status === 'IN_STOCK').slice(0, l.qty).map((u) => u.id) } : l));
        await run('updateDeliveryChallan', { id: dc.id, updates: { lineItems: lines } }, billing, at(plan.day, 15, 10));
      }
      await workJob(plan, job.id);
    });
  }

  // ---------- 10 service jobs ----------
  const svc: JobPlan[] = [
    { type: 'SERVICE', day: '2026-07-06', customer: 'Dr. Kavitha Children Clinic', category: 'CCTV', contract: 'AMC', team: [T[0], T[1]], problem: '2 cameras not recording. DVR shows "HDD error".', stage: 'CLOSED', serviceAmount: 750, use: [['Seagate 1TB Surveillance Hard Disk', 1]], action: 'Replaced failed hard disk, re-terminated 2 BNC connectors.', pay: { option: 'FULL', mode: 'UPI', ref: 'UPI 4417 2219 8820' } },
    { type: 'SERVICE', day: '2026-07-18', customer: 'Mr. Ramesh Residence', category: 'Intercom', contract: 'SERVICE_CALL', team: [T[2]], problem: 'Video door phone not ringing inside the house.', stage: 'CLOSED', serviceAmount: 600, action: 'Loose wire at outdoor unit fixed; tested call and door release.', pay: { option: 'FULL', mode: 'CASH' } },
    { type: 'SERVICE', day: '2026-08-04', customer: 'Velan Engineering College Hostel', category: 'CCTV', contract: 'AMC', team: [T[1]], problem: 'Quarterly AMC visit: clean cameras, check recording on all 16 channels.', stage: 'CLOSED', serviceAmount: 500, action: 'All 16 channels cleaned and checked; recording 30 days. Visit charge as per AMC.', pay: { option: 'NOTHING', mode: 'UPI' } },
    { type: 'SERVICE', day: '2026-08-21', customer: 'Sri Annapoorna Textiles', category: 'CCTV', contract: 'WARRANTY', team: [T[3], T[4]], problem: 'Warehouse bullet camera shows no picture at night.', stage: 'CLOSED', serviceAmount: 500, use: [['CP PLUS 2.4MP Full HD Bullet Camera', 1]], holdReason: 'Ladder needed for 20 ft height — coming back tomorrow.', action: 'Replaced camera under warranty; IR working.', pay: { option: 'PARTIAL', amount: 1500, mode: 'UPI', ref: 'UPI 8812 0091 2233' } },
    { type: 'SERVICE', day: '2026-10-07', customer: 'Bhavani Kumaran Silk House', category: 'Burglar Alarm System', contract: 'SERVICE_CALL', team: [T[5]], problem: 'Alarm siren goes off at night without reason.', stage: 'AWAITING', serviceAmount: 800, action: 'Door sensor battery replaced and sensitivity reset.' },
    { type: 'SERVICE', day: '2026-10-08', customer: 'Green Valley Apartments Association', category: 'Gate Automation', contract: 'AMC', team: [T[6], T[7]], problem: 'Main gate stops half-way while closing.', stage: 'ON_HOLD', serviceAmount: 1200, holdReason: 'Gearbox spare to come from Bengaluru supplier.' },
    { type: 'SERVICE', day: '2026-10-15', customer: 'Hotel Kongu Residency', category: 'CCTV', contract: 'WARRANTY', team: [T[0]], problem: 'Parking camera picture is blurred.', stage: 'IN_PROGRESS', serviceAmount: 500 },
    { type: 'SERVICE', day: '2026-10-15', customer: 'Sakthi Supermarket', category: 'Biometric & Access Control', contract: 'SERVICE_CALL', team: [T[3]], problem: 'Face attendance machine not syncing with the computer.', stage: 'IN_PROGRESS', serviceAmount: 700 },
    { type: 'SERVICE', day: '2026-10-13', customer: 'Mr. Ramesh Residence', category: 'Home Automations', contract: 'SERVICE_CALL', team: [T[4]], problem: 'Two smart switches not responding in the app.', stage: 'ASSIGNED', serviceAmount: 600 },
    { type: 'SERVICE', day: '2026-10-15', customer: 'Dr. Kavitha Children Clinic', category: 'CCTV', contract: 'AMC', team: [T[2], T[5]], problem: 'AMC visit before renewal: check all cameras and backup.', stage: 'ASSIGNED', serviceAmount: 0 },
  ];

  // ---------- 10 installation jobs (4 from quotations) ----------
  const inst: JobPlan[] = [
    { type: 'INSTALLATION', day: '2026-07-14', customer: 'Hotel Kongu Residency', category: 'CCTV', contract: 'OTHERS', team: [T[1], T[2]], problem: '8-camera CCTV for lobby, reception, parking and corridors.', stage: 'CLOSED', serviceAmount: 0, quotation: { lines: [line('CP PLUS 2.4MP Full HD Bullet Camera', 4), line('CP PLUS 2.4MP Dome Camera', 4), line('Hikvision 8-Channel DVR', 1), line('Seagate 1TB Surveillance Hard Disk', 1), labour('Installation, cabling & configuration', 6500)], advance: 50, challan: true, enquiry: 'Phone' }, holdReason: 'False ceiling in corridor 2 not opened yet.', action: '8 cameras installed, DVR set for 30-day recording, mobile app on owner\'s phone.', pay: { option: 'FULL', mode: 'UPI', ref: 'UPI 6621 0098 4410' } },
    { type: 'INSTALLATION', day: '2026-07-27', customer: 'Velan Engineering College Hostel', category: 'Gate Automation', contract: 'OTHERS', team: [T[6], T[7]], problem: 'Automatic swing gate for the main entrance with 2 remotes.', stage: 'CLOSED', serviceAmount: 0, quotation: { lines: [line('Automatic Swing Gate Motor Kit', 1), labour('Gate motor installation & civil work', 6000)], advance: 50, challan: true, enquiry: 'Referral' }, action: 'Gate motor installed, limit switches set, 2 remotes paired.', pay: { option: 'FULL', mode: 'NEFT', ref: 'UTR SBIN226180012' } },
    { type: 'INSTALLATION', day: '2026-08-11', customer: 'Sri Annapoorna Textiles', category: 'Biometric & Access Control', contract: 'OTHERS', team: [T[3]], problem: 'Face attendance terminal at staff entrance.', stage: 'CLOSED', serviceAmount: 2500, use: [['eSSL Face Attendance Terminal', 1]], action: 'Terminal mounted, 64 staff faces enrolled, report set up on office PC.', pay: { option: 'FULL', mode: 'NEFT', ref: 'UTR HDFC0026611' } },
    { type: 'INSTALLATION', day: '2026-08-25', customer: 'Green Valley Apartments Association', category: 'Intercom', contract: 'OTHERS', team: [T[5], T[6]], problem: 'Video door phones for 3 villas.', stage: 'CLOSED', serviceAmount: 3600, use: [['7-inch Video Door Phone', 3]], action: '3 video door phones installed and tested.', pay: { option: 'PARTIAL', amount: 15000, mode: 'CHEQUE', ref: 'Cheque 004512' } },
    { type: 'INSTALLATION', day: '2026-09-10', customer: 'Sakthi Supermarket', category: 'CCTV', contract: 'OTHERS', team: [T[0], T[4]], problem: 'IP cameras for billing counters and stock room.', stage: 'CLOSED', serviceAmount: 0, quotation: { lines: [line('Hikvision 4MP IP Bullet Camera', 4), line('Seagate 1TB Surveillance Hard Disk', 1), labour('Network cabling & NVR setup', 4500)], advance: 40, challan: true, enquiry: 'WhatsApp' }, action: '4 IP cameras over the shop network, remote view on phone.', pay: { option: 'FULL', mode: 'UPI', ref: 'UPI 7700 1234 5566' } },
    { type: 'INSTALLATION', day: '2026-10-10', customer: 'Mr. Ramesh Residence', category: 'Home Automations', contract: 'OTHERS', team: [T[7]], problem: 'Smart switches for hall and bedrooms.', stage: 'AWAITING', serviceAmount: 1500, use: [['Smart Wi-Fi Touch Switch (4 gang)', 4]], action: '4 smart switches installed and added to the owner\'s app.' },
    { type: 'INSTALLATION', day: '2026-10-01', customer: 'Bhavani Kumaran Silk House', category: 'Burglar Alarm System', contract: 'OTHERS', team: [T[5]], problem: 'Wireless alarm with door sensors for the shop.', stage: 'ON_HOLD', serviceAmount: 2000, use: [['Wireless Burglar Alarm Panel', 1]], holdReason: 'Shop closed for Navaratri stock-taking — resume next week.' },
    { type: 'INSTALLATION', day: '2026-10-14', customer: 'Dr. Kavitha Children Clinic', category: 'CCTV', contract: 'OTHERS', team: [T[2], T[3]], problem: '4 more dome cameras for the new wing.', stage: 'IN_PROGRESS', serviceAmount: 0, quotation: { lines: [line('CP PLUS 2.4MP Dome Camera', 4), labour('Installation & cabling', 3000)], advance: 50, challan: true, enquiry: 'Phone' } },
    { type: 'INSTALLATION', day: '2026-10-12', customer: 'Lakshmi Agro Foods Pvt Ltd', category: 'Biometric & Access Control', contract: 'OTHERS', team: [T[1]], problem: 'Face attendance for the second factory gate (staff entrance).', stage: 'ASSIGNED', serviceAmount: 3000 },
    { type: 'INSTALLATION', day: '2026-10-14', customer: 'Palakkad Spices Exports', category: 'CCTV', contract: 'OTHERS', team: [T[0], T[6]], problem: '8-camera CCTV for the warehouse and loading bay.', stage: 'ASSIGNED', serviceAmount: 0 },
  ];
  [...svc, ...inst].forEach(planJob);

  // ---------- enquiries still open / cancelled (6 more, so 10 in all) ----------
  const openEnquiries: [string, string, string, string, 'FOLLOW_UP' | 'CANCELLED', string][] = [
    ['2026-08-18', 'Palakkad Spices Exports', 'CCTV', 'Website', 'FOLLOW_UP', 'Warehouse CCTV — wants a quotation for 8 cameras with night vision.'],
    ['2026-09-03', 'Lakshmi Agro Foods Pvt Ltd', 'Gate Automation', 'Phone', 'CANCELLED', 'Sliding gate motor for the factory — went with a local vendor.'],
    ['2026-09-17', 'Sakthi Supermarket', 'Burglar Alarm System', 'Walk-in', 'FOLLOW_UP', 'Alarm for the godown at night.'],
    ['2026-09-29', 'Green Valley Apartments Association', 'CCTV', 'Referral', 'FOLLOW_UP', 'Cameras for the common areas and both gates.'],
    ['2026-10-08', 'Sri Annapoorna Textiles', 'Home Automations', 'WhatsApp', 'CANCELLED', 'Smart lights for the showroom — budget postponed.'],
    ['2026-10-14', 'Hotel Kongu Residency', 'Intercom', 'Phone', 'FOLLOW_UP', 'Room-to-reception intercom for 24 rooms.'],
  ];
  const quoteFor: Record<string, { lines: ReturnType<typeof line>[]; status: 'DRAFT' | 'SENT' | 'REJECTED' | 'LOST' }> = {
    'Palakkad Spices Exports': { lines: [line('CP PLUS 2.4MP Full HD Bullet Camera', 8), line('Hikvision 8-Channel DVR', 1), line('Seagate 1TB Surveillance Hard Disk', 1), labour('Installation & cabling', 7500)], status: 'SENT' },
    'Sakthi Supermarket': { lines: [line('Wireless Burglar Alarm Panel', 1), labour('Installation', 2000)], status: 'SENT' },
    'Green Valley Apartments Association': { lines: [line('CP PLUS 2.4MP Dome Camera', 6), line('CP PLUS 2.4MP Full HD Bullet Camera', 2), line('Hikvision 8-Channel DVR', 1), labour('Installation & cabling', 6000)], status: 'DRAFT' },
    'Lakshmi Agro Foods Pvt Ltd': { lines: [line('Automatic Swing Gate Motor Kit', 1), labour('Installation', 6500)], status: 'LOST' },
  };
  for (const [day, name, category, source, status, description] of openEnquiries) {
    let enquiryId = '';
    let quotationId = '';
    const q = quoteFor[name];
    on(at(day, 11, 30), `enquiry ${name}`, async () => {
      const cust = st().customers.find((c) => c.id === C[name])!;
      const enq = await run('createEnquiry', {
        customerName: cust.name, customerPhone: cust.phone, customerAddress: cust.address, customerId: cust.id,
        enquiryType: 'INSTALLATION', category, source, createdByUserId: billing.id, description,
      }, billing, at(day, 11, 30));
      enquiryId = enq.id;
    });
    on(at(addDays(day, 1), 10), `follow-up ${name}`, async () => {
      await run('addEnquiryFollowUpNote', { enquiryId, noteText: 'Called the customer; site visit fixed.' }, billing, at(addDays(day, 1), 10));
    });
    if (q) {
      on(at(addDays(day, 2), 12), `quotation ${name}`, async () => {
        const made = await run('createQuotation', {
          customerNumber: C[name], date: addDays(day, 2), validityDays: 15, enquiryId, lineItems: q.lines,
          termsAndConditions: '1. 50% advance with order.\n2. 1-year warranty on hardware.',
          totalAmount: 0, totalCgst: 0, totalSgst: 0, roundOff: 0, grandTotal: 0, bankDetails: bank, status: 'DRAFT',
        }, billing, at(addDays(day, 2), 12));
        quotationId = made.id;
      });
      if (q.status !== 'DRAFT') {
        on(at(addDays(day, 3), 10), `quotation ${name} ${q.status}`, async () => {
          await run('setQuotationStatus', { quotationId, status: q.status, note: q.status === 'LOST' ? 'Went with a local vendor.' : undefined }, billing, at(addDays(day, 3), 10));
        });
      }
    }
    if (status === 'CANCELLED') {
      on(at(addDays(day, 4), 10), `cancel enquiry ${name}`, async () => {
        await run('cancelEnquiry', { enquiryId, reason: description.split('—')[1]?.trim() || 'Not going ahead' }, billing, at(addDays(day, 4), 10));
      });
    }
  }

  // ---------- direct supply to customers outside Tamil Nadu (IGST), part paid, one credit note ----------
  const supply = (customer: string, qDay: string, invDay: string, lines: ReturnType<typeof line>[], terms: string) => {
    const ref = { quotationId: '', invoiceId: '' };
    on(at(qDay, 12), `supply quotation ${customer}`, async () => {
      const q = await run('createQuotation', {
        customerNumber: C[customer], date: qDay, validityDays: 15, lineItems: lines, termsAndConditions: terms,
        totalAmount: 0, totalCgst: 0, totalSgst: 0, roundOff: 0, grandTotal: 0, bankDetails: bank, status: 'SENT',
      }, billing, at(qDay, 12));
      ref.quotationId = q.id;
    });
    on(at(addDays(qDay, 1), 11), `supply accepted ${customer}`, async () => {
      await run('setQuotationStatus', { quotationId: ref.quotationId, status: 'ACCEPTED' }, billing, at(addDays(qDay, 1), 11));
    });
    on(at(invDay, 11), `supply invoice ${customer}`, async () => {
      const inv = await run('convertQuotationToInvoice', { quotationId: ref.quotationId }, billing, at(invDay, 11));
      ref.invoiceId = inv.id;
    });
    return ref;
  };
  const lakshmi = supply('Lakshmi Agro Foods Pvt Ltd', '2026-08-28', '2026-09-01', [line('eSSL Face Attendance Terminal', 2), labour('Installation & enrolment of staff faces', 3000)], '1. 100% payment within 15 days of invoice.');
  on(at('2026-09-12', 12), 'Lakshmi part payment', async () => {
    await run('recordManualPayment', { invoiceId: lakshmi.invoiceId, amount: 15000, paymentMode: 'NEFT', referenceNo: 'HDFC UTR 0026 4411 7788', date: '2026-09-12' }, billing, at('2026-09-12', 12));
  });
  on(at('2026-09-15', 11), 'Lakshmi credit note', async () => {
    await run('createCreditNote', { invoiceId: lakshmi.invoiceId, reason: 'DISCOUNT', reasonNote: 'Discount agreed after installation', lines: [{ sourceLine: 0, qty: 2, rate: 1000 }] }, billing, at('2026-09-15', 11));
  });
  supply('Palakkad Spices Exports', '2026-09-30', '2026-10-03', [line('7-inch Video Door Phone', 2), labour('Installation', 1500)], '1. Payment on delivery.');
  // A later part payment against the Green Valley invoice
  on(at('2026-09-20', 16), 'Green Valley balance', async () => {
    const job = st().jobs.find((j) => j.customerNumber === C['Green Valley Apartments Association'] && j.type === 'INSTALLATION');
    const inv = job && st().invoices.find((i) => i.linkedJobId === job.id);
    if (inv && inv.balanceDue > 0) await run('recordManualPayment', { invoiceId: inv.id, amount: Math.min(5000, inv.balanceDue), paymentMode: 'UPI', referenceNo: 'UPI 3320 1188 0045', date: '2026-09-20' }, billing, at('2026-09-20', 16));
  });

  // ---------- 10 repair tickets at different stages ----------
  type RStage = 'FAULT_REPORTED' | 'PICKED_UP' | 'CHECKED_IN_AT_OFFICE' | 'IN_HOUSE_REPAIR' | 'SENT_TO_VENDOR' | 'READY_TO_REINSTALL' | 'REINSTALLED';
  const repairs: [string, string, string | null, string, User, RStage, 'IN_HOUSE' | 'VENDOR'][] = [
    ['2026-07-24', 'Hotel Kongu Residency', 'CP PLUS 2.4MP Full HD Bullet Camera', 'Parking camera — no picture at night, IR LEDs not working.', T[0], 'REINSTALLED', 'VENDOR'],
    ['2026-08-08', 'Velan Engineering College Hostel', 'Automatic Swing Gate Motor Kit', 'Gate motor control board burnt after lightning.', T[6], 'REINSTALLED', 'IN_HOUSE'],
    ['2026-09-03', 'Sri Annapoorna Textiles', null, 'Customer\'s old 4-channel DVR (bought elsewhere) restarts again and again.', T[3], 'REINSTALLED', 'IN_HOUSE'],
    ['2026-09-22', 'Green Valley Apartments Association', '7-inch Video Door Phone', 'Villa 2 indoor monitor has no sound.', T[5], 'REINSTALLED', 'VENDOR'],
    ['2026-10-01', 'Hotel Kongu Residency', 'CP PLUS 2.4MP Dome Camera', 'Reception dome camera picture has lines.', T[1], 'SENT_TO_VENDOR', 'VENDOR'],
    ['2026-10-05', 'Sri Annapoorna Textiles', 'eSSL Face Attendance Terminal', 'Terminal screen flickers.', T[3], 'READY_TO_REINSTALL', 'IN_HOUSE'],
    ['2026-10-08', 'Sakthi Supermarket', 'Hikvision 4MP IP Bullet Camera', 'Billing counter camera goes offline every evening.', T[4], 'IN_HOUSE_REPAIR', 'IN_HOUSE'],
    ['2026-10-11', 'Dr. Kavitha Children Clinic', 'Seagate 1TB Surveillance Hard Disk', 'Hard disk making clicking noise.', T[2], 'CHECKED_IN_AT_OFFICE', 'VENDOR'],
    ['2026-10-13', 'Mr. Ramesh Residence', null, 'Customer\'s old analog camera (bought elsewhere) needs checking.', T[7], 'PICKED_UP', 'IN_HOUSE'],
    ['2026-10-15', 'Hotel Kongu Residency', 'Hikvision 8-Channel DVR', 'DVR beeps continuously at night.', T[1], 'FAULT_REPORTED', 'IN_HOUSE'],
  ];
  for (const [day, name, productName, fault, tech, stage, pathKind] of repairs) {
    const path: RStage[] = ['FAULT_REPORTED', 'PICKED_UP', 'CHECKED_IN_AT_OFFICE', pathKind === 'VENDOR' ? 'SENT_TO_VENDOR' : 'IN_HOUSE_REPAIR', 'READY_TO_REINSTALL', 'REINSTALLED'];
    let ticketId = '';
    on(at(day, 13), `repair ${name}`, async () => {
      const unit = productName
        ? st().serialUnits.find((u) => u.productId === P[productName] && u.status === 'INSTALLED' && u.soldToCustomerId === C[name]) ||
          st().serialUnits.find((u) => u.productId === P[productName] && u.status === 'INSTALLED')
        : undefined;
      const ticket = await run('createRepairTicket', {
        customerId: C[name], assignedTechnicianId: tech.id, serialUnitId: unit?.id,
        customUnitDescription: unit ? undefined : fault.split(' (')[0], faultDescription: fault,
      }, billing, at(day, 13));
      ticketId = ticket.id;
    });
    // Each later stage on its own day (the supplier keeps a unit about a week)
    let d = day;
    for (const next of path.slice(1, path.indexOf(stage) + 1)) {
      d = addDays(d, next === 'READY_TO_REINSTALL' && pathKind === 'VENDOR' ? 7 : 1);
      const when = d;
      const details: Record<string, unknown> = {};
      if (next === 'IN_HOUSE_REPAIR') Object.assign(details, { repairPath: 'IN_HOUSE', inHouseRepairedByUserId: tech.id, inHouseRepairNotes: 'Board checked, faulty part replaced.' });
      if (next === 'SENT_TO_VENDOR') Object.assign(details, { repairPath: 'VENDOR', vendorId: V[productName?.startsWith('7-inch') ? 9 : 1], vendorSentDate: when, vendorExpectedReturnDate: addDays(when, 20) });
      if (next === 'READY_TO_REINSTALL' && pathKind === 'VENDOR') Object.assign(details, { vendorActualReturnDate: when, vendorRepairNotes: 'Repaired under warranty.' });
      if (next === 'READY_TO_REINSTALL' && pathKind === 'IN_HOUSE') Object.assign(details, { note: 'Tested for 24 hours, working.' });
      if (next === 'REINSTALLED') Object.assign(details, { reinstalledLocation: 'Same place as before' });
      on(at(when, 16), `repair ${name} → ${next}`, async () => {
        await run('transitionRepairTicket', { ticketId, nextStatus: next, details }, tech, at(when, 16));
      });
    }
  }

  // ---------- 10 leave entries ----------
  const leave: [User, 'PAID' | 'CASUAL' | 'UNPAID', string, string, boolean, string][] = [
    [T[0], 'CASUAL', '2026-07-20', '2026-07-20', false, 'Family function'],
    [T[1], 'PAID', '2026-08-10', '2026-08-12', false, 'Native place visit'],
    [T[2], 'CASUAL', '2026-08-17', '2026-08-17', true, 'Bank work'],
    [T[3], 'UNPAID', '2026-08-26', '2026-08-27', false, 'Extended personal leave'],
    [T[4], 'PAID', '2026-09-07', '2026-09-08', false, 'Fever'],
    [T[5], 'CASUAL', '2026-09-15', '2026-09-15', false, 'Child\'s school meeting'],
    [T[6], 'PAID', '2026-09-28', '2026-10-03', false, 'Sister\'s wedding'],
    [T[7], 'CASUAL', '2026-10-05', '2026-10-05', false, 'Personal work'],
    [billing, 'PAID', '2026-10-09', '2026-10-09', false, 'Medical check-up'],
    [U['Kavitha Senthil'], 'CASUAL', '2026-10-13', '2026-10-13', true, 'Personal work'],
  ];
  for (const [u, type, from, to, halfDay, reason] of leave) {
    on(at(addDays(from, -1), 17), `leave ${u.name}`, async () => {
      await run('addLeave', { userId: u.id, type, from, to, halfDay, reason }, ceo, at(addDays(from, -1), 17));
    });
  }

  // ---------- run everything in date order ----------
  // Events may add more events (a job's later steps), so keep taking the earliest
  let count = 0;
  while (events.length) {
    events.sort((a, b) => a.when.getTime() - b.when.getTime() || a.seq - b.seq);
    const e = events.shift()!;
    try {
      await e.fn();
    } catch (err) {
      console.error(`[demo] failed at "${e.label}" (${e.when.toISOString()}):`, err instanceof Error ? err.message : err);
      throw err;
    }
    count++;
  }

  const s = st();
  console.log(`[demo] done after ${count} steps:`);
  console.log(`  staff ${s.users.length}, customers ${s.customers.length}, suppliers ${s.vendors.length}, products ${s.products.length}, serial units ${s.serialUnits.length}`);
  console.log(`  enquiries ${s.enquiries.length}, quotations ${s.quotations.length}, jobs ${s.jobs.length} (service ${s.jobs.filter((j) => j.type === 'SERVICE').length}, installation ${s.jobs.filter((j) => j.type === 'INSTALLATION').length})`);
  console.log(`  challans ${s.deliveryChallans.length}, invoices ${s.invoices.length}, credit notes ${s.creditNotes.length}, payments ${s.payments.length}, repairs ${s.repairTickets.length}, leave ${s.leaveRecords.length}`);
  console.log(`  job stages: ${Object.entries(s.jobs.reduce((m: Record<string, number>, j) => ((m[j.status] = (m[j.status] || 0) + 1), m), {})).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  await db.close();
}

main().catch((err) => {
  console.error('[demo] stopped:', err instanceof Error ? err.message : err);
  process.exit(1);
});
