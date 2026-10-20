export type Recipient = {
  id: number;
  name: string;
  iban: string;
  createdAt: string;
};

export type RecipientList = {
  recipients: Recipient[];
  demoConfirmationEnabled: boolean;
};

export type CreateRecipientRequest = {
  name: string;
  iban: string;
  demoConfirmed: true;
};
