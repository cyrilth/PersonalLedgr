"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"

const STORAGE_KEY = "personalledgr-disclaimer-accepted"

export function DisclaimerModal() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem(STORAGE_KEY)
    if (accepted !== "true") {
      setShow(true)
    }
  }, [])

  function handleAccept() {
    localStorage.setItem(STORAGE_KEY, "true")
    setShow(false)
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-2xl rounded-lg border bg-card p-6 shadow-lg">
        <h2 className="mb-4 text-xl font-bold">Disclaimer</h2>

        <ScrollArea className="h-[60vh] pr-4">
          <div className="space-y-4 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">PersonalLedgr</strong> is provided
              &quot;as is&quot; without warranty of any kind, express or implied.
            </p>

            <h3 className="text-base font-semibold text-foreground">No Financial Advice</h3>
            <p>
              This software is <strong>not</strong> a substitute for professional financial,
              tax, or legal advice. Nothing in this application should be interpreted as
              financial guidance or a recommendation to take any specific financial action.
            </p>

            <h3 className="text-base font-semibold text-foreground">No Liability for Data Accuracy</h3>
            <p>The developer is <strong>not responsible</strong> for:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                <strong>Data loss</strong> — including but not limited to database corruption,
                failed backups, migration errors, or accidental deletion
              </li>
              <li>
                <strong>Inaccurate calculations</strong> — interest accrual, amortization
                schedules, APR calculations, balance tracking, and budget figures are
                approximations and may not match your financial institution&apos;s figures exactly
              </li>
              <li>
                <strong>Misreported balances</strong> — stored balances may drift from actual
                bank balances due to timing, manual entry errors, import discrepancies, or
                synchronization issues
              </li>
              <li>
                <strong>Double-counted or missing transactions</strong> — while the application
                is designed to prevent double-counting, no system is infallible
              </li>
              <li>
                <strong>Incorrect interest or payment projections</strong> — extra payment
                calculators, payoff date estimates, and interest projections are for
                informational purposes only
              </li>
            </ul>

            <h3 className="text-base font-semibold text-foreground">User Responsibility</h3>
            <p>Users are solely responsible for:</p>
            <ul className="list-disc space-y-1 pl-5">
              <li>Verifying all financial data independently against their bank and financial institution statements</li>
              <li>Maintaining their own backups of critical financial records</li>
              <li>Making their own informed financial decisions</li>
              <li>Ensuring the accuracy of manually entered data</li>
              <li>Reviewing imported and auto-synced transactions for correctness</li>
            </ul>

            <h3 className="text-base font-semibold text-foreground">No Warranty</h3>
            <p className="text-xs uppercase leading-relaxed">
              THIS SOFTWARE IS PROVIDED &quot;AS IS&quot;, WITHOUT WARRANTY OF ANY KIND,
              EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
              MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NONINFRINGEMENT. IN NO
              EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES,
              OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT, OR OTHERWISE,
              ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
              DEALINGS IN THE SOFTWARE.
            </p>

            <h3 className="text-base font-semibold text-foreground">Use at Your Own Risk</h3>
            <p>
              By using PersonalLedgr, you acknowledge that you have read and understood this
              disclaimer and agree to use the software at your own risk.
            </p>
          </div>
        </ScrollArea>

        <div className="mt-6 flex justify-end">
          <Button onClick={handleAccept} size="lg">
            I understand and accept
          </Button>
        </div>
      </div>
    </div>
  )
}
