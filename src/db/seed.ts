import { PrismaClient } from "../generated/prisma/index.js"
import { Decimal } from "../generated/prisma/runtime/library.js"

const prisma = new PrismaClient()

// ── Helpers ─────────────────────────────────────────────────────────

function daysAgo(days: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - days)
  d.setHours(12, 0, 0, 0)
  return d
}

function monthsAgo(months: number, day: number = 1): Date {
  const d = new Date()
  d.setMonth(d.getMonth() - months, day)
  d.setHours(12, 0, 0, 0)
  return d
}

function randomBetween(min: number, max: number): number {
  return Math.round((Math.random() * (max - min) + min) * 100) / 100
}

function cuid(): string {
  return crypto.randomUUID()
}

// ── Main Seed ───────────────────────────────────────────────────────

export async function seed() {
  console.log("[seed] Starting seed...")

  // We need a user. Create a demo user via Better Auth's user table.
  // In production, users register through the UI. For seeding, we create directly.
  const demoUser = await prisma.user.upsert({
    where: { email: "demo@personalledgr.local" },
    update: {},
    create: {
      id: cuid(),
      name: "Demo User",
      email: "demo@personalledgr.local",
      emailVerified: true,
    },
  })
  const userId = demoUser.id
  console.log("[seed] Demo user:", demoUser.email)

  // ── Accounts ────────────────────────────────────────────────────

  const checking = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Chase Checking",
      type: "CHECKING",
      balance: new Decimal("8450.00"),
      owner: "John",
      userId,
    },
  })

  const chaseSapphire = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Chase Sapphire CC",
      type: "CREDIT_CARD",
      balance: new Decimal("-2340.00"),
      creditLimit: new Decimal("15000.00"),
      owner: "John",
      userId,
    },
  })

  const discoverIt = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Discover It CC",
      type: "CREDIT_CARD",
      balance: new Decimal("-890.00"),
      creditLimit: new Decimal("8000.00"),
      owner: "Jane",
      userId,
    },
  })

  const savings = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Marcus Savings",
      type: "SAVINGS",
      balance: new Decimal("25000.00"),
      owner: null,
      userId,
    },
  })

  // Loan accounts
  const mortgageAcct = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Home Mortgage",
      type: "MORTGAGE",
      balance: new Decimal("-285000.00"),
      userId,
    },
  })

  const carLoanAcct = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Car Loan",
      type: "LOAN",
      balance: new Decimal("-18500.00"),
      userId,
    },
  })

  const studentLoanAcct = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Student Loan",
      type: "LOAN",
      balance: new Decimal("-32000.00"),
      userId,
    },
  })

  console.log("[seed] Created 7 accounts")

  // ── Credit Card Details ─────────────────────────────────────────

  await prisma.creditCardDetails.createMany({
    data: [
      {
        id: cuid(),
        accountId: chaseSapphire.id,
        statementCloseDay: 15,
        paymentDueDay: 10,
        gracePeriodDays: 25,
        lastStatementBalance: new Decimal("2100.00"),
        lastStatementPaidInFull: true,
        minimumPaymentPct: new Decimal("0.0200"),
        minimumPaymentFloor: new Decimal("25.00"),
      },
      {
        id: cuid(),
        accountId: discoverIt.id,
        statementCloseDay: 20,
        paymentDueDay: 15,
        gracePeriodDays: 21,
        lastStatementBalance: new Decimal("750.00"),
        lastStatementPaidInFull: false,
        minimumPaymentPct: new Decimal("0.0200"),
        minimumPaymentFloor: new Decimal("25.00"),
      },
    ],
  })
  console.log("[seed] Created credit card details")

  // ── APR Rates ───────────────────────────────────────────────────

  const chaseStandardApr = await prisma.aprRate.create({
    data: {
      id: cuid(),
      accountId: chaseSapphire.id,
      rateType: "STANDARD",
      apr: new Decimal("0.2499"),
      effectiveDate: monthsAgo(12),
      isActive: true,
      description: "Standard purchase APR",
    },
  })

  const chaseIntroApr = await prisma.aprRate.create({
    data: {
      id: cuid(),
      accountId: chaseSapphire.id,
      rateType: "INTRO",
      apr: new Decimal("0.0000"),
      effectiveDate: monthsAgo(2),
      expirationDate: monthsAgo(-4), // 4 months from now
      isActive: true,
      description: "0% intro on Best Buy purchase",
    },
  })

  await prisma.aprRate.create({
    data: {
      id: cuid(),
      accountId: discoverIt.id,
      rateType: "STANDARD",
      apr: new Decimal("0.2249"),
      effectiveDate: monthsAgo(12),
      isActive: true,
      description: "Standard purchase APR",
    },
  })
  console.log("[seed] Created APR rates")

  // ── Loans ───────────────────────────────────────────────────────

  await prisma.loan.createMany({
    data: [
      {
        id: cuid(),
        accountId: mortgageAcct.id,
        loanType: "MORTGAGE",
        originalBalance: new Decimal("320000.00"),
        interestRate: new Decimal("0.0675"),
        termMonths: 360,
        startDate: monthsAgo(24),
        monthlyPayment: new Decimal("2076.00"),
      },
      {
        id: cuid(),
        accountId: carLoanAcct.id,
        loanType: "AUTO",
        originalBalance: new Decimal("25000.00"),
        interestRate: new Decimal("0.0549"),
        termMonths: 60,
        startDate: monthsAgo(12),
        monthlyPayment: new Decimal("535.00"),
      },
      {
        id: cuid(),
        accountId: studentLoanAcct.id,
        loanType: "STUDENT",
        originalBalance: new Decimal("45000.00"),
        interestRate: new Decimal("0.0499"),
        termMonths: 120,
        startDate: monthsAgo(36),
        monthlyPayment: new Decimal("480.00"),
      },
    ],
  })
  console.log("[seed] Created 3 loans")

  // ── Transactions (6 months) ─────────────────────────────────────

  const transactions: Parameters<typeof prisma.transaction.create>[0]["data"][] = []

  for (let m = 5; m >= 0; m--) {
    // -- Paycheck (2x/month) --
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 1),
      description: "Paycheck - Acme Corp",
      amount: new Decimal("6500.00"),
      type: "INCOME",
      category: "Salary",
      source: "RECURRING",
      accountId: checking.id,
      userId,
    })
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 15),
      description: "Paycheck - Acme Corp",
      amount: new Decimal("6500.00"),
      type: "INCOME",
      category: "Salary",
      source: "RECURRING",
      accountId: checking.id,
      userId,
    })

    // -- Recurring CC bills on Chase Sapphire --
    const ccBills = [
      { desc: "T-Mobile", amt: "145.00", cat: "Utilities", day: 3 },
      { desc: "Comcast Internet", amt: "89.99", cat: "Utilities", day: 5 },
      { desc: "Netflix", amt: "22.99", cat: "Subscriptions", day: 8 },
      { desc: "Spotify", amt: "15.99", cat: "Subscriptions", day: 8 },
    ]
    for (const bill of ccBills) {
      transactions.push({
        id: cuid(),
        date: monthsAgo(m, bill.day),
        description: bill.desc,
        amount: new Decimal(`-${bill.amt}`),
        type: "EXPENSE",
        category: bill.cat,
        source: "RECURRING",
        accountId: chaseSapphire.id,
        userId,
        aprRateId: chaseStandardApr.id,
      })
    }

    // -- Gym on Discover --
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 1),
      description: "Planet Fitness",
      amount: new Decimal("-24.99"),
      type: "EXPENSE",
      category: "Healthcare",
      source: "RECURRING",
      accountId: discoverIt.id,
      userId,
    })

    // -- Variable expenses on Chase Sapphire --
    const groceryCount = 4 + Math.floor(Math.random() * 3)
    for (let g = 0; g < groceryCount; g++) {
      transactions.push({
        id: cuid(),
        date: monthsAgo(m, 2 + g * 4),
        description: ["Whole Foods", "Trader Joe's", "Costco", "Kroger", "Safeway"][g % 5],
        amount: new Decimal(`-${randomBetween(45, 180).toFixed(2)}`),
        type: "EXPENSE",
        category: "Groceries",
        source: "MANUAL",
        accountId: chaseSapphire.id,
        userId,
        aprRateId: chaseStandardApr.id,
      })
    }

    // Dining
    const diningCount = 2 + Math.floor(Math.random() * 3)
    for (let d = 0; d < diningCount; d++) {
      transactions.push({
        id: cuid(),
        date: monthsAgo(m, 6 + d * 5),
        description: ["Olive Garden", "Chipotle", "Starbucks", "Sushi Palace", "Thai Kitchen"][d % 5],
        amount: new Decimal(`-${randomBetween(12, 85).toFixed(2)}`),
        type: "EXPENSE",
        category: "Dining Out",
        source: "MANUAL",
        accountId: chaseSapphire.id,
        userId,
        aprRateId: chaseStandardApr.id,
      })
    }

    // Gas on Discover
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 10),
      description: "Shell Gas Station",
      amount: new Decimal(`-${randomBetween(40, 65).toFixed(2)}`),
      type: "EXPENSE",
      category: "Gas",
      source: "MANUAL",
      accountId: discoverIt.id,
      userId,
    })
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 22),
      description: "Exxon Gas",
      amount: new Decimal(`-${randomBetween(35, 60).toFixed(2)}`),
      type: "EXPENSE",
      category: "Gas",
      source: "MANUAL",
      accountId: discoverIt.id,
      userId,
    })

    // -- CC payment transfers (Chase Sapphire from checking) --
    const chasePaymentId = cuid()
    const chasePaymentLinkedId = cuid()
    transactions.push({
      id: chasePaymentId,
      date: monthsAgo(m, 10),
      description: "Payment to Chase Sapphire CC",
      amount: new Decimal("-2100.00"),
      type: "TRANSFER",
      category: "Credit Card Payment",
      source: "MANUAL",
      accountId: checking.id,
      userId,
      linkedTransactionId: chasePaymentLinkedId,
    })
    transactions.push({
      id: chasePaymentLinkedId,
      date: monthsAgo(m, 10),
      description: "Payment from Chase Checking",
      amount: new Decimal("2100.00"),
      type: "TRANSFER",
      category: "Credit Card Payment",
      source: "MANUAL",
      accountId: chaseSapphire.id,
      userId,
      linkedTransactionId: chasePaymentId,
    })

    // Discover payment
    const discPaymentId = cuid()
    const discPaymentLinkedId = cuid()
    transactions.push({
      id: discPaymentId,
      date: monthsAgo(m, 15),
      description: "Payment to Discover It CC",
      amount: new Decimal("-750.00"),
      type: "TRANSFER",
      category: "Credit Card Payment",
      source: "MANUAL",
      accountId: checking.id,
      userId,
      linkedTransactionId: discPaymentLinkedId,
    })
    transactions.push({
      id: discPaymentLinkedId,
      date: monthsAgo(m, 15),
      description: "Payment from Chase Checking",
      amount: new Decimal("750.00"),
      type: "TRANSFER",
      category: "Credit Card Payment",
      source: "MANUAL",
      accountId: discoverIt.id,
      userId,
      linkedTransactionId: discPaymentId,
    })

    // -- Mortgage payment (split: principal + interest) --
    const mortgageInterest = new Decimal((285000 * 0.0675 / 12).toFixed(2))
    const mortgagePrincipal = new Decimal("2076.00").minus(mortgageInterest)
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 1),
      description: "Mortgage Payment - Principal",
      amount: mortgagePrincipal.negated(),
      type: "LOAN_PRINCIPAL",
      category: "Loan Payment",
      source: "SYSTEM",
      accountId: mortgageAcct.id,
      userId,
    })
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 1),
      description: "Mortgage Payment - Interest",
      amount: mortgageInterest.negated(),
      type: "LOAN_INTEREST",
      category: "Loan Payment",
      source: "SYSTEM",
      accountId: mortgageAcct.id,
      userId,
    })

    // -- Car loan payment --
    const carInterest = new Decimal((18500 * 0.0549 / 12).toFixed(2))
    const carPrincipal = new Decimal("535.00").minus(carInterest)
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 5),
      description: "Car Loan Payment - Principal",
      amount: carPrincipal.negated(),
      type: "LOAN_PRINCIPAL",
      category: "Loan Payment",
      source: "SYSTEM",
      accountId: carLoanAcct.id,
      userId,
    })
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 5),
      description: "Car Loan Payment - Interest",
      amount: carInterest.negated(),
      type: "LOAN_INTEREST",
      category: "Loan Payment",
      source: "SYSTEM",
      accountId: carLoanAcct.id,
      userId,
    })

    // -- Student loan payment --
    const studentInterest = new Decimal((32000 * 0.0499 / 12).toFixed(2))
    const studentPrincipal = new Decimal("480.00").minus(studentInterest)
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 10),
      description: "Student Loan Payment - Principal",
      amount: studentPrincipal.negated(),
      type: "LOAN_PRINCIPAL",
      category: "Loan Payment",
      source: "SYSTEM",
      accountId: studentLoanAcct.id,
      userId,
    })
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 10),
      description: "Student Loan Payment - Interest",
      amount: studentInterest.negated(),
      type: "LOAN_INTEREST",
      category: "Loan Payment",
      source: "SYSTEM",
      accountId: studentLoanAcct.id,
      userId,
    })

    // -- Savings transfer from checking --
    const savingsTransferId = cuid()
    const savingsTransferLinkedId = cuid()
    transactions.push({
      id: savingsTransferId,
      date: monthsAgo(m, 20),
      description: "Transfer to Marcus Savings",
      amount: new Decimal("-1000.00"),
      type: "TRANSFER",
      category: "Transfer",
      source: "MANUAL",
      accountId: checking.id,
      userId,
      linkedTransactionId: savingsTransferLinkedId,
    })
    transactions.push({
      id: savingsTransferLinkedId,
      date: monthsAgo(m, 20),
      description: "Transfer from Chase Checking",
      amount: new Decimal("1000.00"),
      type: "TRANSFER",
      category: "Transfer",
      source: "MANUAL",
      accountId: savings.id,
      userId,
      linkedTransactionId: savingsTransferId,
    })

    // -- Interest earned on savings --
    const savingsInterestAmt = new Decimal(randomBetween(85, 105).toFixed(2))
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 28),
      description: "Interest Earned - Marcus Savings",
      amount: savingsInterestAmt,
      type: "INTEREST_EARNED",
      category: "Investment Income",
      source: "SYSTEM",
      accountId: savings.id,
      userId,
    })

    // -- Interest charged on Discover (didn't pay in full) --
    const discInterestAmt = new Decimal(randomBetween(12, 18).toFixed(2))
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 20),
      description: "Interest Charge - Discover It",
      amount: discInterestAmt.negated(),
      type: "INTEREST_CHARGED",
      category: "Interest Charged",
      source: "SYSTEM",
      accountId: discoverIt.id,
      userId,
    })
  }

  // -- Special: Best Buy TV purchase at 0% intro APR (2 months ago) --
  transactions.push({
    id: cuid(),
    date: monthsAgo(2, 12),
    description: "Best Buy - Samsung 65\" TV",
    amount: new Decimal("-1299.99"),
    type: "EXPENSE",
    category: "Electronics",
    source: "MANUAL",
    accountId: chaseSapphire.id,
    userId,
    aprRateId: chaseIntroApr.id,
  })

  // Create all transactions (linked pairs must be created carefully due to unique constraint)
  // We need to create non-linked first, then linked ones in proper order
  const nonLinked = transactions.filter((t) => !t.linkedTransactionId)
  const linked = transactions.filter((t) => t.linkedTransactionId)

  // Create non-linked transactions in bulk
  for (const t of nonLinked) {
    await prisma.transaction.create({ data: t })
  }

  // Create linked transactions: sort so that each pair's "first" side is created before "second"
  const createdIds = new Set<string>()
  const linkedSorted = [...linked].sort((a, b) => {
    // If a's linkedTransactionId hasn't been created yet, a goes first
    if (!createdIds.has(a.linkedTransactionId!)) return -1
    return 1
  })

  // Process linked pairs: create the one that doesn't reference an existing ID first
  const linkedById = new Map(linked.map((t) => [t.id as string, t]))
  const processed = new Set<string>()

  for (const t of linked) {
    if (processed.has(t.id as string)) continue
    const partner = linkedById.get(t.linkedTransactionId as string)
    if (!partner) continue

    // Create first without the link, then the second with link, then update first
    await prisma.transaction.create({
      data: { ...t, linkedTransactionId: null },
    })
    await prisma.transaction.create({
      data: partner,
    })
    await prisma.transaction.update({
      where: { id: t.id as string },
      data: { linkedTransactionId: partner.id as string },
    })

    processed.add(t.id as string)
    processed.add(partner.id as string)
  }

  console.log(`[seed] Created ${transactions.length} transactions`)

  // ── Recurring Bills ─────────────────────────────────────────────

  await prisma.recurringBill.createMany({
    data: [
      {
        id: cuid(),
        name: "T-Mobile",
        amount: new Decimal("145.00"),
        frequency: "MONTHLY",
        dayOfMonth: 3,
        isVariableAmount: false,
        category: "Utilities",
        isActive: true,
        nextDueDate: monthsAgo(-1, 3),
        userId,
        accountId: chaseSapphire.id,
      },
      {
        id: cuid(),
        name: "Comcast Internet",
        amount: new Decimal("89.99"),
        frequency: "MONTHLY",
        dayOfMonth: 5,
        isVariableAmount: false,
        category: "Utilities",
        isActive: true,
        nextDueDate: monthsAgo(-1, 5),
        userId,
        accountId: chaseSapphire.id,
      },
      {
        id: cuid(),
        name: "Netflix",
        amount: new Decimal("22.99"),
        frequency: "MONTHLY",
        dayOfMonth: 8,
        isVariableAmount: false,
        category: "Subscriptions",
        isActive: true,
        nextDueDate: monthsAgo(-1, 8),
        userId,
        accountId: chaseSapphire.id,
      },
      {
        id: cuid(),
        name: "Electric Bill",
        amount: new Decimal("150.00"),
        frequency: "MONTHLY",
        dayOfMonth: 18,
        isVariableAmount: true,
        category: "Utilities",
        isActive: true,
        nextDueDate: monthsAgo(-1, 18),
        userId,
        accountId: checking.id,
      },
      {
        id: cuid(),
        name: "Water Bill",
        amount: new Decimal("65.00"),
        frequency: "MONTHLY",
        dayOfMonth: 22,
        isVariableAmount: true,
        category: "Utilities",
        isActive: true,
        nextDueDate: monthsAgo(-1, 22),
        userId,
        accountId: checking.id,
      },
    ],
  })
  console.log("[seed] Created 5 recurring bills (3 fixed, 2 variable)")

  // ── Budgets ─────────────────────────────────────────────────────

  const currentPeriod = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`
  await prisma.budget.createMany({
    data: [
      { id: cuid(), category: "Groceries", period: currentPeriod, limit: new Decimal("600.00"), userId },
      { id: cuid(), category: "Dining Out", period: currentPeriod, limit: new Decimal("300.00"), userId },
      { id: cuid(), category: "Entertainment", period: currentPeriod, limit: new Decimal("200.00"), userId },
    ],
  })
  console.log("[seed] Created 3 budgets")

  // ── Interest Logs ───────────────────────────────────────────────

  const interestLogs: Parameters<typeof prisma.interestLog.create>[0]["data"][] = []
  for (let m = 5; m >= 0; m--) {
    // Savings interest earned
    interestLogs.push({
      id: cuid(),
      date: monthsAgo(m, 28),
      amount: new Decimal(randomBetween(85, 105).toFixed(2)),
      type: "EARNED",
      notes: "Monthly APY interest",
      userId,
      accountId: savings.id,
    })
    // Discover interest charged
    interestLogs.push({
      id: cuid(),
      date: monthsAgo(m, 20),
      amount: new Decimal(randomBetween(12, 18).toFixed(2)),
      type: "CHARGED",
      notes: "Monthly interest charge",
      userId,
      accountId: discoverIt.id,
    })
  }
  await prisma.interestLog.createMany({ data: interestLogs })
  console.log(`[seed] Created ${interestLogs.length} interest log entries`)

  console.log("[seed] Done!")
}

// Run directly via tsx (pnpm db:seed)
const isDirectRun = process.argv[1]?.includes("seed")
if (isDirectRun) {
  seed()
    .catch((e) => {
      console.error("[seed] Error:", e)
      process.exit(1)
    })
    .finally(() => prisma.$disconnect())
}
