export type FieldType = 'text' | 'secret' | 'bool' | 'number' | 'tags';

export interface SettingField {
  /** Same name as the environment variable it overrides. */
  key: string;
  label: string;
  type: FieldType;
  help?: string;
  placeholder?: string;
}

export interface SettingSection {
  id: string;
  title: string;
  description?: string;
  /** Webhook the provider must be told about, shown to the admin as a ready-to-copy address. */
  webhookPath?: string;
  fields: SettingField[];
}

export interface SettingGroup {
  id: string;
  title: string;
  description: string;
  sections: SettingSection[];
}

/** Everything that can be set from the back office. Anything not listed stays in the environment. */
export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: 'payments',
    title: 'Payments',
    description: 'How customers pay. A gateway turns on as soon as its keys are saved.',
    sections: [
      {
        id: 'razorpay',
        title: 'Razorpay',
        description: 'UPI, cards, netbanking and wallets for India.',
        webhookPath: '/payments/webhooks/razorpay',
        fields: [
          { key: 'RAZORPAY_KEY_ID', label: 'Key ID', type: 'text', placeholder: 'rzp_live_…' },
          { key: 'RAZORPAY_KEY_SECRET', label: 'Key secret', type: 'secret' },
          { key: 'RAZORPAY_WEBHOOK_SECRET', label: 'Webhook secret', type: 'secret', help: 'The secret you typed when creating the webhook in the Razorpay dashboard.' },
        ],
      },
      {
        id: 'stripe',
        title: 'Stripe',
        description: 'International cards.',
        webhookPath: '/payments/webhooks/stripe',
        fields: [
          { key: 'STRIPE_SECRET_KEY', label: 'Secret key', type: 'secret', placeholder: 'sk_live_…' },
          { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret', type: 'secret', placeholder: 'whsec_…' },
        ],
      },
      {
        id: 'general',
        title: 'Checkout rules',
        fields: [
          { key: 'COD_ENABLED', label: 'Cash on delivery', type: 'bool', help: 'Let customers pay when the parcel arrives.' },
          { key: 'ORDER_PAYMENT_TTL_MINUTES', label: 'Hold unpaid orders for (minutes)', type: 'number', help: 'After this, an unpaid order is cancelled and its stock goes back on sale.' },
        ],
      },
    ],
  },
  {
    id: 'pricing',
    title: 'Metal pricing',
    description: 'Pieces with a net metal weight are priced as (weight x rate + making charge + diamond + stones) x 1.03. Saving a new rate reprices every piece of that metal.',
    sections: [
      {
        id: 'metalrates',
        title: 'Metal rates per gram (INR)',
        fields: [
          { key: 'GOLD_RATE_PER_GRAM', label: 'Gold', type: 'number', help: 'The rate for the purity you sell (e.g. 22K or 18K).' },
          { key: 'SILVER_RATE_PER_GRAM', label: 'Silver', type: 'number' },
          { key: 'PLATINUM_RATE_PER_GRAM', label: 'Platinum', type: 'number' },
        ],
      },
    ],
  },
  {
    id: 'email',
    title: 'Email',
    description: 'Password links, verification and order emails. Sent with Resend.',
    sections: [
      {
        id: 'resend',
        title: 'Sender',
        fields: [
          { key: 'RESEND_API_KEY', label: 'Resend API key', type: 'secret', placeholder: 're_…' },
          { key: 'MAIL_FROM', label: 'From address', type: 'text', placeholder: 'Dia Diamonds <no-reply@yourdomain.com>', help: 'Used for every email. The domain must be verified in Resend.' },
          { key: 'MAIL_FROM_ACCOUNT', label: 'From address, account emails (optional)', type: 'text', placeholder: 'Dia Diamonds <no-reply@yourdomain.com>', help: 'Only if verification and password emails should come from a different address. Leave empty to use the one above.' },
        ],
      },
      {
        id: 'templates',
        title: 'Resend templates',
        fields: [
          { key: 'RESEND_VERIFY_TEMPLATE_ID', label: 'Verify email template', type: 'text', placeholder: 'email-verify', help: 'Id or alias of a published template in your Resend dashboard. We fill in first_name, company_name, company_address and magic_link_url. Leave empty to use the built-in design.' },
        ],
      },
      {
        id: 'company',
        title: 'Company details',
        fields: [
          { key: 'COMPANY_NAME', label: 'Company name', type: 'text', placeholder: 'Dia Diamonds', help: 'Fills company_name in Resend templates.' },
          { key: 'COMPANY_ADDRESS', label: 'Company address', type: 'text', placeholder: '12 Example Street, Chennai 600001', help: 'Fills company_address in Resend templates.' },
        ],
      },
    ],
  },
  {
    id: 'sms',
    title: 'Phone and SMS',
    description: 'One-time codes for mobile sign-in. Sent with OTPFlow.',
    sections: [
      {
        id: 'otpflow',
        title: 'OTPFlow',
        description: 'OTPFlow delivers the SMS to Indian mobile numbers. Our server makes the code and checks it. Create the API key in your OTPFlow dashboard (API keys) and keep the wallet topped up.',
        fields: [
          { key: 'OTPFLOW_API_KEY', label: 'API key', type: 'secret', placeholder: 'otpf_…' },
        ],
      },
    ],
  },
  {
    id: 'login',
    title: 'Google sign-in',
    description: 'Let customers sign in with their Google account.',
    sections: [
      {
        id: 'clients',
        title: 'Google OAuth client',
        description: 'Create an OAuth client in Google Cloud (type Web) and paste its client ID. Add your website address as an authorised JavaScript origin.',
        fields: [
          { key: 'GOOGLE_CLIENT_IDS', label: 'Google client IDs', type: 'tags', help: 'The first one is used for the Sign in with Google button on the website.' },
        ],
      },
    ],
  },
];

export const ALL_FIELDS: SettingField[] = SETTING_GROUPS.flatMap((g) => g.sections.flatMap((s) => s.fields));
export const FIELD_BY_KEY = new Map(ALL_FIELDS.map((f) => [f.key, f]));
