import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

interface Props {
  params: { token: string };
}

export default function ResetPasswordPage({ params }: Props) {
  return <ResetPasswordForm token={params.token} />;
}
