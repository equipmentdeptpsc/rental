# Dashboard management KPI audit

Certified base: `36215e6e2a872f3964030bc149244745bbff25cb`. The remote Dashboard route was already lazy loaded. Its reader already paged equipment, statuses, assignments, rentals, DEURs, statements and rental-scoped collections; the billing visibility panel performed a second DEUR read. The chart library is Recharts. The reported UAT first load baseline is approximately 1–2 seconds; no live timing was measured during this change.

“Period” below means the selected Dashboard date range. “Snapshot” means current state and is deliberately independent of that range. Statement amount is a billing measure, not recognized accounting revenue. Financial data is displayed only when both `billing.read` and `collections.read` are granted.

| KPI | Existing | Authoritative data | Source and formula | Period support | No DB change | Decision / limitation |
| --- | --- | --- | --- | --- | --- | --- |
| Total equipment | Yes | Yes | Active, nondeleted equipment count from equipment read model and resolved status master | Snapshot | Yes | In fleet card |
| Deployed equipment | Yes | Yes | Equipment with current `Assigned` or `Rented` status; one status per asset | Snapshot | Yes | Executive card |
| Equipment utilization | Yes | Yes | Deployed / active nondeleted equipment × 100; zero fleet yields 0 | Snapshot | Yes | Executive card; not period operating-hour utilization |
| Active rentals | Yes | Yes | Rentals currently `Active` | Snapshot | Yes | Executive card, filtered link |
| Revenue / invoiced amount | Lifetime total existed | Yes, as invoiced billing | Noncancelled invoiced statement `grandTotal` (or `subtotal`) whose `billingTo` is in period | Yes | Yes | Named **Invoiced amount** to avoid accounting revenue claim |
| Collections | Lifetime total existed | Yes | Positive rental-scoped, statement-matched transactions by `paymentDate` | Yes | Yes | Executive card and trend |
| Collection performance | Lifetime collected/billed existed | Due denominator unavailable | Period collections / period invoiced amount × 100 | Yes | Yes | Named **Collection realization**; may exceed 100% on older payments |
| Outstanding receivables | Yes | Yes, as current invoiced balance | Sum of statement totals less capped matched collections | Snapshot | Yes | Executive card; no period aging claim |
| Revenue trend | No | Yes, billing measure | Invoiced amount by billing-period end; daily/weekly/monthly buckets | Yes | Yes | Lazy chart |
| Collections trend | No | Yes | Rental-scoped payments by payment date, same buckets | Yes | Yes | Same chart axis, same currency |
| Revenue per equipment | No | Conditional | Statement-line totals by equipment ID | Yes | Yes | Show only if every selected invoice has complete lineage and line totals reconcile |
| Top revenue equipment | No | Conditional | Top five of reconciled equipment-line invoiced totals | Yes | Yes | Suppressed with explanation when attribution incomplete |
| Top customers | No | Yes | Invoiced statement total grouped by rental customer ID or snapshot name | Yes | Yes | Top five; link to Rentals customer filter |
| Top projects | No | Yes | Invoiced statement total grouped by rental project ID or snapshot name; project master supplies code/name | Yes | Yes | Top five; link to Rentals project filter |
| Top utilized equipment | No | Yes, as deployment days | Distinct active assignment/rental-line overlap days / observed period days | Yes | Yes | Top five; explicitly not operating-hour utilization |
| Low utilization equipment | No | No reliable fleet eligibility start | Would require eligible observation duration and maintenance history per asset | No | No reliable result | Deferred: no commissioning date and limited historical eligibility; newly added equipment would rank falsely idle |
| Idle-heavy equipment | No | Yes for acknowledged/billed DEURs | Idle minutes / (operation + idle minutes) × 100; standby excluded | Yes | Yes | Top five at a 40% presentation threshold, not a permanent business rule |
| Equipment requiring attention | Action queue existed | Yes for selected conditions | Overdue active/released rental returns; active line without operator; measured high idle | Mixed snapshot/period | Yes | Linked to Rental workspace or Equipment |
| Fleet availability | Yes in legacy analytics | Yes | Available / active fleet | Snapshot | Yes | Available count retained in Fleet section; separate percentage omitted to keep dashboard compact |
| Active vs available fleet | Yes | Yes | Mutually exclusive current status counts | Snapshot | Yes | Existing Fleet legend retained; no extra donut |
| Rental pipeline | Partial | Yes | Current counts by stored lifecycle status | Snapshot | Yes | Compact linked list; no invented Approved status |
| Receivables aging | No | No authoritative invoice due date | Due date aging unavailable | No | No reliable result | Deferred |
| Average revenue per active equipment | No | Conditional | Period invoiced amount / equipment with reconciled invoice-line revenue | Yes | Yes | Deferred because line attribution may be incomplete and metric adds little beyond ranking |
| Maintenance due / certification alerts | Partial maintenance counts | Not established in Dashboard read | Would require reliable due/expiry evidence | No | Unclear | Deferred; no invented alert |

## Comparison and source rules

- The default is This Month through today. Last Month and Last Quarter are complete calendar periods; This Quarter and This Year run through today. Custom dates are limited to 366 days and may not end in the future.
- Previous Period uses an immediately preceding range with the same inclusive day count. Same Period Last Year shifts both dates one year back, capping leap-day dates where needed. A zero prior value shows “New” or “No prior activity,” never infinite growth.
- Current fleet and outstanding cards say they are snapshots. Billing trends use `billingTo`; collections use `paymentDate`. Collections are never treated as revenue.
- The reader starts independent paged reads in parallel. It adds one rental-line read and, for financial viewers, one project read. Collections remain scoped per rental and grouped in batches of eight. Billing visibility is computed from the existing DEUR read, removing its second DEUR fetch. The trend chart loads only near the viewport.
- Read pagination has a 200-row page size and 100-page safety cap. A failed required read surfaces an error rather than a false zero. There is no UAT timing measurement; validate the first load against the reported 1–2 second baseline during review.
