import { useState, type FormEvent } from 'react';
import { LuKeyRound } from 'react-icons/lu';
import { z } from 'zod';
import { useChangePassword } from '../../api/auth';
import { getErrorMessage } from '../../api/client';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Card, CardBody, CardFooter, CardHeader } from '../../components/ui/Card';
import { PasswordInput } from '../../components/ui/Field';
import { useToast } from '../../components/ui/toast/ToastContext';
import { MIN_PASSWORD_LENGTH, focusFirstError, validateForm, type FieldErrors } from '../../utils/validation';

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Ange ditt nuvarande lösenord.'),
    newPassword: z.string().min(MIN_PASSWORD_LENGTH, `Det nya lösenordet måste ha minst ${MIN_PASSWORD_LENGTH} tecken.`),
    confirmPassword: z.string().min(1, 'Upprepa det nya lösenordet.'),
  })
  .superRefine((values, context) => {
    if (values.confirmPassword && values.newPassword !== values.confirmPassword) {
      context.addIssue({ code: 'custom', path: ['confirmPassword'], message: 'Lösenorden matchar inte.' });
    }
    if (values.newPassword && values.newPassword === values.currentPassword) {
      context.addIssue({
        code: 'custom',
        path: ['newPassword'],
        message: 'Det nya lösenordet måste skilja sig från det nuvarande.',
      });
    }
  });

type PasswordValues = { currentPassword: string; newPassword: string; confirmPassword: string };

const EMPTY: PasswordValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function SecurityTab() {
  const changePassword = useChangePassword();
  const toast = useToast();
  const [values, setValues] = useState<PasswordValues>(EMPTY);
  const [errors, setErrors] = useState<FieldErrors<PasswordValues>>({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  function update(field: keyof PasswordValues, value: string) {
    const next = { ...values, [field]: value };
    setValues(next);
    setServerError(null);
    if (submitted) setErrors(validateForm(changePasswordSchema, next).errors);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const result = validateForm(changePasswordSchema, values);
    setErrors(result.errors);
    if (!result.success) {
      focusFirstError(result.errors, 'password-');
      return;
    }
    try {
      await changePassword.mutateAsync({
        currentPassword: result.data.currentPassword,
        newPassword: result.data.newPassword,
      });
      toast.success('Lösenordet har ändrats. Använd det nya lösenordet nästa gång du loggar in.');
      setValues(EMPTY);
      setErrors({});
      setSubmitted(false);
    } catch (error) {
      setServerError(getErrorMessage(error, 'Lösenordet kunde inte ändras. Försök igen.'));
    }
  }

  return (
    <div className="settings-grid">
      <Card>
        <form onSubmit={handleSubmit} noValidate>
          <CardHeader title="Byt lösenord" description="Välj ett lösenord som du inte använder någon annanstans." divider />
          <CardBody className="form-stack form-stack--narrow">
            {serverError && (
              <Alert tone="danger" title="Lösenordet kunde inte ändras">
                {serverError}
              </Alert>
            )}
            <PasswordInput
              id="password-currentPassword"
              label="Nuvarande lösenord"
              autoComplete="current-password"
              value={values.currentPassword}
              onChange={(event) => update('currentPassword', event.target.value)}
              error={errors.currentPassword}
            />
            <PasswordInput
              id="password-newPassword"
              label="Nytt lösenord"
              autoComplete="new-password"
              value={values.newPassword}
              onChange={(event) => update('newPassword', event.target.value)}
              error={errors.newPassword}
              hint={`Minst ${MIN_PASSWORD_LENGTH} tecken. En lång fras är både säker och lätt att komma ihåg.`}
            />
            <PasswordInput
              id="password-confirmPassword"
              label="Upprepa nytt lösenord"
              autoComplete="new-password"
              value={values.confirmPassword}
              onChange={(event) => update('confirmPassword', event.target.value)}
              error={errors.confirmPassword}
            />
          </CardBody>
          <CardFooter className="form-actions">
            <Button type="submit" icon={LuKeyRound} loading={changePassword.isPending}>
              Byt lösenord
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader title="Så skyddas ditt konto" divider />
        <CardBody>
          <ul className="plain-list plain-list--spaced">
            <li>Du loggas ut automatiskt när sessionen har gått ut.</li>
            <li>Lösenord sparas aldrig i klartext, och inloggningsförsök begränsas.</li>
            <li>Inloggningar, utloggningar och lösenordsbyten sparas i granskningsloggen.</li>
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
