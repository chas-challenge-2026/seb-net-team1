import { FiAlertCircle, FiInfo, FiLoader } from "react-icons/fi";

interface AuthFeedbackProps {
  kind: "info" | "loading" | "error";
  message: string;
  id?: string;
}

export default function AuthFeedback({ kind, message, id }: AuthFeedbackProps) {
  const Icon = kind === "error" ? FiAlertCircle : kind === "loading" ? FiLoader : FiInfo;

  return (
    <p
      className={`login-feedback login-feedback--${kind}`}
      id={id}
      role={kind === "error" ? "alert" : "status"}
      aria-atomic="true"
    >
      <Icon aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}
