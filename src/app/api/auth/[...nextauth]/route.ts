import NextAuth from "next-auth";
import { opcoesAuth } from "@/lib/auth";

const handler = NextAuth(opcoesAuth);

export { handler as GET, handler as POST };
