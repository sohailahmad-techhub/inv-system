export type InvoiceStatus =
  | 'draft'
  | 'sent'
  | 'viewed'
  | 'paid'
  | 'overdue'
  | 'cancelled';

export interface Address {
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
}

export interface UserPreferences {
  timezone?: string;
  currency?: string;
  dateFormat?: string;
  theme?: 'light' | 'dark';
  notifications?: {
    email?: boolean;
    sms?: boolean;
    push?: boolean;
  };
}

export interface User {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'ACCOUNTANT' | 'CLIENT';
  companyName?: string;
  phone?: string;
  address?: Address;
  isActive?: boolean;
  preferences?: UserPreferences;
  createdAt?: string;
  updatedAt?: string;
}

export interface InvoiceItem {
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface InvoicePaymentRef {
  paymentId: Payment | string;
  amount: number;
  date: string;
  method?: string;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  clientId: User | string;
  createdBy?: User | string;
  items: InvoiceItem[];
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  issueDate: string;
  dueDate: string;
  paidDate?: string;
  notes?: string;
  paymentTerms?: string;
  totalPaid?: number;
  remainingBalance?: number;
  lastSent?: string;
  createdAt?: string;
  updatedAt?: string;
  payments?: InvoicePaymentRef[];
}

export interface Payment {
  _id: string;
  invoiceId: Invoice | string;
  clientId: User | string;
  amount: number;
  currency?: string;
  method: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentDate: string;
  reference?: string;
  notes?: string;
  externalData?: {
    processor?: string;
    transactionId?: string;
    fee?: number;
    netAmount?: number;
  };
  createdAt?: string;
  updatedAt?: string;
}

export type ApiError = {
  success?: false;
  message?: string;
  errors?: Array<{ msg: string; param?: string }>;
};
