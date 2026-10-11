import { atlasPassword, atlasUsername, showLoginOnPage } from "@/lib/auth";
import LoginForm from "./LoginForm";

export default function Login() {
  const username = atlasUsername();
  return <LoginForm askUsername={Boolean(username)} shown={showLoginOnPage() ? { username, password: atlasPassword() } : null} />;
}
