import type { PrismaClient } from "@prisma/client"

// ── Helpers ─────────────────────────────────────────────────────────

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

/** Round to 2 decimal places */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

// ── Main Seed ───────────────────────────────────────────────────────

export async function seed(prisma?: PrismaClient) {
  if (!prisma) {
    // Lazy import for standalone execution
    const { prisma: dbPrisma } = await import("@/db")
    prisma = dbPrisma
  }

  console.log("[seed] Starting seed...")

  // We need a user. Create a demo user via Better Auth's user table.
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
      balance: 8450.0,
      owner: "John",
      userId,
    },
  })

  const chaseSapphire = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Chase Sapphire CC",
      type: "CREDIT_CARD",
      balance: -2340.0,
      creditLimit: 15000.0,
      owner: "John",
      userId,
    },
  })

  const discoverIt = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Discover It CC",
      type: "CREDIT_CARD",
      balance: -890.0,
      creditLimit: 8000.0,
      owner: "Jane",
      userId,
    },
  })

  const savings = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Marcus Savings",
      type: "SAVINGS",
      balance: 25000.0,
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
      balance: -285000.0,
      userId,
    },
  })

  const carLoanAcct = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Car Loan",
      type: "LOAN",
      balance: -18500.0,
      userId,
    },
  })

  const studentLoanAcct = await prisma.account.create({
    data: {
      id: cuid(),
      name: "Student Loan",
      type: "LOAN",
      balance: -32000.0,
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
        lastStatementBalance: 2100.0,
        lastStatementPaidInFull: true,
        minimumPaymentPct: 0.02,
        minimumPaymentFloor: 25.0,
      },
      {
        id: cuid(),
        accountId: discoverIt.id,
        statementCloseDay: 20,
        paymentDueDay: 15,
        gracePeriodDays: 21,
        lastStatementBalance: 750.0,
        lastStatementPaidInFull: false,
        minimumPaymentPct: 0.02,
        minimumPaymentFloor: 25.0,
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
      apr: 0.2499,
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
      apr: 0.0,
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
      apr: 0.2249,
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
        originalBalance: 320000.0,
        interestRate: 0.0675,
        termMonths: 360,
        startDate: monthsAgo(24),
        monthlyPayment: 2076.0,
      },
      {
        id: cuid(),
        accountId: carLoanAcct.id,
        loanType: "AUTO",
        originalBalance: 25000.0,
        interestRate: 0.0549,
        termMonths: 60,
        startDate: monthsAgo(12),
        monthlyPayment: 535.0,
      },
      {
        id: cuid(),
        accountId: studentLoanAcct.id,
        loanType: "STUDENT",
        originalBalance: 45000.0,
        interestRate: 0.0499,
        termMonths: 120,
        startDate: monthsAgo(36),
        monthlyPayment: 480.0,
      },
    ],
  })
  console.log("[seed] Created 3 loans")

  // ── Transactions (6 months) ─────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const transactions: any[] = []

  for (let m = 5; m >= 0; m--) {
    // -- Paycheck (2x/month) --
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 1),
      description: "Paycheck - Acme Corp",
      amount: 6500.0,
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
      amount: 6500.0,
      type: "INCOME",
      category: "Salary",
      source: "RECURRING",
      accountId: checking.id,
      userId,
    })

    // -- Recurring CC bills on Chase Sapphire --
    const ccBills = [
      { desc: "T-Mobile", amt: 145.0, cat: "Utilities", day: 3 },
      { desc: "Comcast Internet", amt: 89.99, cat: "Utilities", day: 5 },
      { desc: "Netflix", amt: 22.99, cat: "Subscriptions", day: 8 },
      { desc: "Spotify", amt: 15.99, cat: "Subscriptions", day: 8 },
    ]
    for (const bill of ccBills) {
      transactions.push({
        id: cuid(),
        date: monthsAgo(m, bill.day),
        description: bill.desc,
        amount: -bill.amt,
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
      amount: -24.99,
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
        amount: -randomBetween(45, 180),
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
        amount: -randomBetween(12, 85),
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
      amount: -randomBetween(40, 65),
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
      amount: -randomBetween(35, 60),
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
      amount: -2100.0,
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
      amount: 2100.0,
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
      amount: -750.0,
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
      amount: 750.0,
      type: "TRANSFER",
      category: "Credit Card Payment",
      source: "MANUAL",
      accountId: discoverIt.id,
      userId,
      linkedTransactionId: discPaymentId,
    })

    // -- Mortgage payment (split: principal + interest) --
    const mortgageInterestAmt = r2(285000 * 0.0675 / 12)
    const mortgagePrincipalAmt = r2(2076.0 - mortgageInterestAmt)
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 1),
      description: "Mortgage Payment - Principal",
      amount: -mortgagePrincipalAmt,
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
      amount: -mortgageInterestAmt,
      type: "LOAN_INTEREST",
      category: "Loan Payment",
      source: "SYSTEM",
      accountId: mortgageAcct.id,
      userId,
    })

    // -- Car loan payment --
    const carInterestAmt = r2(18500 * 0.0549 / 12)
    const carPrincipalAmt = r2(535.0 - carInterestAmt)
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 5),
      description: "Car Loan Payment - Principal",
      amount: -carPrincipalAmt,
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
      amount: -carInterestAmt,
      type: "LOAN_INTEREST",
      category: "Loan Payment",
      source: "SYSTEM",
      accountId: carLoanAcct.id,
      userId,
    })

    // -- Student loan payment --
    const studentInterestAmt = r2(32000 * 0.0499 / 12)
    const studentPrincipalAmt = r2(480.0 - studentInterestAmt)
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 10),
      description: "Student Loan Payment - Principal",
      amount: -studentPrincipalAmt,
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
      amount: -studentInterestAmt,
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
      amount: -1000.0,
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
      amount: 1000.0,
      type: "TRANSFER",
      category: "Transfer",
      source: "MANUAL",
      accountId: savings.id,
      userId,
      linkedTransactionId: savingsTransferId,
    })

    // -- Interest earned on savings --
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 28),
      description: "Interest Earned - Marcus Savings",
      amount: randomBetween(85, 105),
      type: "INTEREST_EARNED",
      category: "Investment Income",
      source: "SYSTEM",
      accountId: savings.id,
      userId,
    })

    // -- Interest charged on Discover (didn't pay in full) --
    transactions.push({
      id: cuid(),
      date: monthsAgo(m, 20),
      description: "Interest Charge - Discover It",
      amount: -randomBetween(12, 18),
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
    amount: -1299.99,
    type: "EXPENSE",
    category: "Electronics",
    source: "MANUAL",
    accountId: chaseSapphire.id,
    userId,
    aprRateId: chaseIntroApr.id,
  })

  // Create all transactions (linked pairs must be created carefully due to unique constraint)
  const nonLinked = transactions.filter((t) => !t.linkedTransactionId)
  const linked = transactions.filter((t) => t.linkedTransactionId)

  // Create non-linked transactions in bulk
  for (const t of nonLinked) {
    await prisma.transaction.create({ data: t })
  }

  // Create linked transactions: process pairs together
  const linkedById = new Map(linked.map((t) => [t.id as string, t]))
  const processed = new Set<string>()

  for (const t of linked) {
    if (processed.has(t.id as string)) continue
    const partner = linkedById.get(t.linkedTransactionId as string)
    if (!partner) continue

    // Create first without the link, then the second with link, then update first
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { linkedTransactionId: _linkedId, ...tWithoutLink } = t
    await prisma.transaction.create({
      data: tWithoutLink,
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
        amount: 145.0,
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
        amount: 89.99,
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
        amount: 22.99,
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
        amount: 150.0,
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
        amount: 65.0,
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
      { id: cuid(), category: "Groceries", period: currentPeriod, limit: 600.0, userId },
      { id: cuid(), category: "Dining Out", period: currentPeriod, limit: 300.0, userId },
      { id: cuid(), category: "Entertainment", period: currentPeriod, limit: 200.0, userId },
    ],
  })
  console.log("[seed] Created 3 budgets")

  // ── Interest Logs ───────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interestLogs: any[] = []
  for (let m = 5; m >= 0; m--) {
    // Savings interest earned
    interestLogs.push({
      id: cuid(),
      date: monthsAgo(m, 28),
      amount: randomBetween(85, 105),
      type: "EARNED",
      notes: "Monthly APY interest",
      userId,
      accountId: savings.id,
    })
    // Discover interest charged
    interestLogs.push({
      id: cuid(),
      date: monthsAgo(m, 20),
      amount: randomBetween(12, 18),
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

