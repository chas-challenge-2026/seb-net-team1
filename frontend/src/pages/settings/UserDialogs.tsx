import { useState, type FormEvent } from 'react';
import { z } from 'zod';
import { ApiError, getErrorMessage } from '../../api/client';
import type { Role, UserAdmin } from '../../api/types';
import { useCreateUser, useResetUserPassword, useUpdateUser } from '../../api/users';
import { sessionStore } from '../../auth/session';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input, PasswordInput, Select, Switch } from '../../components/ui/Field';
import { useToast } from '../../components/ui/toast/ToastContext';
import { ROLES, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../utils/labels';
import { MIN_PASSWORD_LENGTH, focusFirstError, validateForm, type FieldErrors } from '../../utils/validation';

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Ange användarens för- och efternamn.')
  .max(100, 'Namnet får vara högst 100 tecken.');
const roleSchema = z.enum(ROLES, { error: 'Välj en roll.' });
const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH, `Lösenordet måste ha minst ${MIN_PASSWORD_LENGTH} tecken.`);

function RoleOptions() {
  return (
    <>
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {ROLE_LABELS[role]}
        </option>
      ))}
    </>
  );
}

// ---------------------------------------------------------------- Create

const createUserSchema = z.object({
  name: nameSchema,
  email: z
    .string()
    .trim()
    .min(1, 'Ange en e-postadress.')
    .pipe(z.email('Ange en giltig e-postadress, till exempel namn@foretag.se.')),
  role: roleSchema,
  password: passwordSchema,
});

type CreateValues = { name: string; email: string; role: Role; password: string };

export function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const createUser = useCreateUser();
  const toast = useToast();
  const [values, setValues] = useState<CreateValues>({ name: '', email: '', role: 'initiator', password: '' });
  const [errors, setErrors] = useState<FieldErrors<CreateValues>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function update<K extends keyof CreateValues>(field: K, value: CreateValues[K]) {
    const next = { ...values, [field]: value };
    setValues(next);
    setServerError(null);
    if (submitted) setErrors(validateForm(createUserSchema, next).errors);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const result = validateForm(createUserSchema, values);
    setErrors(result.errors);
    if (!result.success) {
      focusFirstError(result.errors, 'create-user-');
      return;
    }
    try {
      const created = await createUser.mutateAsync(result.data);
      toast.success(`${created.name} har lagts till som ${ROLE_LABELS[created.role]?.toLowerCase() ?? created.role}.`);
      onClose();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        setErrors((current) => ({ ...current, email: error.detail }));
        document.getElementById('create-user-email')?.focus();
        return;
      }
      setServerError(getErrorMessage(error, 'Användaren kunde inte skapas. Försök igen.'));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Ny användare"
      description="Användaren loggar in med e-postadressen och lösenordet du anger."
      dismissible={!createUser.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={createUser.isPending}>
            Avbryt
          </Button>
          <Button type="submit" form="create-user-form" loading={createUser.isPending}>
            Skapa användare
          </Button>
        </>
      }
    >
      <form id="create-user-form" className="form-stack" onSubmit={handleSubmit} noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <Input
          id="create-user-name"
          label="Namn"
          autoComplete="off"
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          error={errors.name}
        />
        <Input
          id="create-user-email"
          label="E-postadress"
          type="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={values.email}
          onChange={(event) => update('email', event.target.value)}
          error={errors.email}
        />
        <Select
          id="create-user-role"
          label="Roll"
          value={values.role}
          onChange={(event) => update('role', event.target.value as Role)}
          error={errors.role}
          hint={ROLE_DESCRIPTIONS[values.role]}
        >
          <RoleOptions />
        </Select>
        <PasswordInput
          id="create-user-password"
          label="Startlösenord"
          autoComplete="new-password"
          value={values.password}
          onChange={(event) => update('password', event.target.value)}
          error={errors.password}
          hint={`Minst ${MIN_PASSWORD_LENGTH} tecken. Lämna över lösenordet på ett säkert sätt.`}
        />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Edit

const editUserSchema = z.object({ name: nameSchema, role: roleSchema, isActive: z.boolean() });

type EditValues = { name: string; role: Role; isActive: boolean };

export function EditUserDialog({ user, isSelf, onClose }: { user: UserAdmin; isSelf: boolean; onClose: () => void }) {
  const updateUser = useUpdateUser();
  const toast = useToast();
  const [values, setValues] = useState<EditValues>({ name: user.name, role: user.role, isActive: user.isActive });
  const [errors, setErrors] = useState<FieldErrors<EditValues>>({});
  const [serverError, setServerError] = useState<string | null>(null);

  function update<K extends keyof EditValues>(field: K, value: EditValues[K]) {
    setValues((current) => ({ ...current, [field]: value }));
    setServerError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // An administrator can never demote or deactivate themselves (the API refuses as well).
    const candidate = isSelf ? { ...values, role: user.role, isActive: user.isActive } : values;
    const result = validateForm(editUserSchema, candidate);
    setErrors(result.errors);
    if (!result.success) {
      focusFirstError(result.errors, 'edit-user-');
      return;
    }
    try {
      const saved = await updateUser.mutateAsync({ userId: user.id, body: result.data });
      if (isSelf) sessionStore.updateUser({ name: saved.name });
      toast.success(`Ändringarna för ${saved.name} har sparats.`);
      onClose();
    } catch (error) {
      setServerError(getErrorMessage(error, 'Ändringarna kunde inte sparas. Försök igen.'));
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={`Redigera ${user.name}`}
      description={user.email}
      dismissible={!updateUser.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={updateUser.isPending}>
            Avbryt
          </Button>
          <Button type="submit" form="edit-user-form" loading={updateUser.isPending}>
            Spara ändringar
          </Button>
        </>
      }
    >
      <form id="edit-user-form" className="form-stack" onSubmit={handleSubmit} noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <Input
          id="edit-user-name"
          label="Namn"
          autoComplete="off"
          value={values.name}
          onChange={(event) => update('name', event.target.value)}
          error={errors.name}
        />
        <Select
          id="edit-user-role"
          label="Roll"
          value={values.role}
          onChange={(event) => update('role', event.target.value as Role)}
          disabled={isSelf}
          error={errors.role}
          hint={isSelf ? 'Du kan inte ändra din egen roll.' : ROLE_DESCRIPTIONS[values.role]}
        >
          <RoleOptions />
        </Select>
        <Switch
          id="edit-user-active"
          label="Aktivt konto"
          description={
            isSelf
              ? 'Du kan inte inaktivera ditt eget konto.'
              : 'En inaktiv användare kan inte logga in. Historiken finns kvar.'
          }
          checked={values.isActive}
          disabled={isSelf}
          onChange={(event) => update('isActive', event.target.checked)}
        />
      </form>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Reset password

const resetPasswordSchema = z
  .object({ newPassword: passwordSchema, confirmPassword: z.string().min(1, 'Upprepa lösenordet.') })
  .superRefine((values, context) => {
    if (values.confirmPassword && values.newPassword !== values.confirmPassword) {
      context.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Lösenorden matchar inte.' });
    }
  });

type ResetValues = { newPassword: string; confirmPassword: string };

export function ResetPasswordDialog({ user, onClose }: { user: UserAdmin; onClose: () => void }) {
  const resetPassword = useResetUserPassword();
  const toast = useToast();
  const [values, setValues] = useState<ResetValues>({ newPassword: '', confirmPassword: '' });
  const [errors, setErrors] = useState<FieldErrors<ResetValues>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function update(field: keyof ResetValues, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    setServerError(null);
    if (submitted) setErrors(validateForm(resetPasswordSchema, next).errors);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const result = validateForm(resetPasswordSchema, values);
    setErrors(result.errors);
    if (!result.success) {
      focusFirstError(result.errors, 'reset-');
      return;
    }
    try {
      await resetPassword.mutateAsync({ userId: user.id, body: { newPassword: result.data.newPassword } });
      toast.success(`Lösenordet för ${user.name} har återställts.`);
      onClose();
    } catch (error) {
      setServerError(getErrorMessage(error, 'Lösenordet kunde inte återställas. Försök igen.'));
    }
  }

  return (
    <Dialog
      open
      size="sm"
      onClose={onClose}
      title="Återställ lösenord"
      description={`Välj ett nytt lösenord för ${user.name}.`}
      dismissible={!resetPassword.isPending}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={resetPassword.isPending}>
            Avbryt
          </Button>
          <Button type="submit" form="reset-password-form" loading={resetPassword.isPending}>
            Återställ lösenord
          </Button>
        </>
      }
    >
      <form id="reset-password-form" className="form-stack" onSubmit={handleSubmit} noValidate>
        {serverError && <Alert tone="danger">{serverError}</Alert>}
        <PasswordInput
          id="reset-newPassword"
          label="Nytt lösenord"
          autoComplete="new-password"
          value={values.newPassword}
          onChange={(event) => update('newPassword', event.target.value)}
          error={errors.newPassword}
          hint={`Minst ${MIN_PASSWORD_LENGTH} tecken.`}
        />
        <PasswordInput
          id="reset-confirmPassword"
          label="Upprepa lösenordet"
          autoComplete="new-password"
          value={values.confirmPassword}
          onChange={(event) => update('confirmPassword', event.target.value)}
          error={errors.confirmPassword}
        />
        <Alert tone="info">Lämna över lösenordet på ett säkert sätt och be användaren byta det efter inloggning.</Alert>
      </form>
    </Dialog>
  );
}
