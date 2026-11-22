// One short how-to video per screen. Key = screen id stored in public.help_videos.
export const HELP_SCREENS: { key: string; title: string; group: string }[] = [
  { key: 'home', title: 'Home screen', group: 'General' },
  { key: 'accounts', title: 'Find an account', group: 'Accounts' },
  { key: 'account-new', title: 'Add a new account', group: 'Accounts' },
  { key: 'account-view', title: 'Account page (transactions, partner, notes)', group: 'Accounts' },
  { key: 'account-edit', title: 'Edit an account', group: 'Accounts' },
  { key: 'inbox', title: 'Send a photo to the Inbox', group: 'Inventory' },
  { key: 'inbox-review', title: 'Review a photo and save the stones', group: 'Inventory' },
  { key: 'stock', title: 'Search white diamonds', group: 'Inventory' },
  { key: 'stock-new', title: 'Enter a white diamond', group: 'Inventory' },
  { key: 'stock-view', title: 'Stone page (history, costs, partnership)', group: 'Inventory' },
  { key: 'stock-edit', title: 'Edit a white diamond', group: 'Inventory' },
  { key: 'parcels', title: 'Search diamond parcels', group: 'Inventory' },
  { key: 'parcel-new', title: 'Enter a diamond parcel', group: 'Inventory' },
  { key: 'parcel-mixing', title: 'Parcel mixing list', group: 'Inventory' },
  { key: 'mix-new', title: 'Mix parcels', group: 'Inventory' },
  { key: 'jewelry', title: 'Search jewelry', group: 'Inventory' },
  { key: 'jewelry-new', title: 'Enter a piece of jewelry', group: 'Inventory' },
  { key: 'memos', title: 'Find a memo', group: 'Sales' },
  { key: 'memo-new', title: 'Create a memo', group: 'Sales' },
  { key: 'memo-view', title: 'Memo page (return, print, invoice)', group: 'Sales' },
  { key: 'memo-quick-return', title: 'Memo quick return', group: 'Sales' },
  { key: 'invoices', title: 'Find an invoice', group: 'Sales' },
  { key: 'invoice-new', title: 'Create an invoice', group: 'Sales' },
  { key: 'invoice-view', title: 'Invoice page (print, credit, payment)', group: 'Sales' },
  { key: 'payments-in', title: 'Customer payments list', group: 'Sales' },
  { key: 'payment-in-new', title: 'Receive a customer payment', group: 'Sales' },
  { key: 'payment-in-view', title: 'Customer payment page', group: 'Sales' },
  { key: 'memo-in', title: 'Find a memo-in', group: 'Purchasing' },
  { key: 'memo-in-new', title: 'Enter a memo-in', group: 'Purchasing' },
  { key: 'memo-in-view', title: 'Memo-in page (return to supplier, buy)', group: 'Purchasing' },
  { key: 'purchases', title: 'Purchases & vendor bills', group: 'Purchasing' },
  { key: 'purchase-new', title: 'Enter a purchase', group: 'Purchasing' },
  { key: 'purchase-view', title: 'Purchase page', group: 'Purchasing' },
  { key: 'awaiting-bills', title: 'Sold from memo-in, waiting for vendor invoice', group: 'Purchasing' },
  { key: 'payments-out', title: 'Supplier payments list', group: 'Purchasing' },
  { key: 'payment-out-new', title: 'Pay a supplier', group: 'Purchasing' },
  { key: 'payment-out-view', title: 'Supplier payment page', group: 'Purchasing' },
  { key: 'team', title: 'Team', group: 'Settings' },
  { key: 'settings', title: 'Settings', group: 'Settings' },
]

const byKey = new Map(HELP_SCREENS.map((s) => [s.key, s]))
export const helpTitle = (key: string) => byKey.get(key)?.title ?? 'This screen'

/** Screen id for the current route, or null when the screen has no help (e.g. "coming soon"). */
export function helpKey(r: string[]): string | null {
  const [a, b, c] = r
  const listNewView = (list: string, one: string) => (!b ? list : b === 'new' ? one + '-new' : c === 'edit' ? one + '-edit' : one + '-view')
  switch (a) {
    case undefined: return 'home'
    case 'accounts': return listNewView('accounts', 'account')
    case 'stock': return listNewView('stock', 'stock')
    case 'inbox': return b ? 'inbox-review' : 'inbox'
    case 'memos': return listNewView('memos', 'memo')
    case 'docs': return 'memo-view'
    case 'memo-in': return listNewView('memo-in', 'memo-in')
    case 'memo-quick-return': return 'memo-quick-return'
    case 'parcels': return b === 'new' ? 'parcel-new' : 'parcels'
    case 'jewelry': return b === 'new' ? 'jewelry-new' : 'jewelry'
    case 'parcel-mixing': return b === 'new' ? 'mix-new' : 'parcel-mixing'
    case 'invoices': return listNewView('invoices', 'invoice')
    case 'purchases': return listNewView('purchases', 'purchase')
    case 'awaiting-bills': return 'awaiting-bills'
    case 'payments-in': return listNewView('payments-in', 'payment-in')
    case 'payments-out': return listNewView('payments-out', 'payment-out')
    case 'team': return 'team'
    case 'settings': return 'settings'
    default: return null
  }
}
