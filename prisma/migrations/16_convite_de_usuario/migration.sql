-- Convite de usuario reaproveita a mesma mecanica da redefinicao de senha: um
-- token de uso unico, guardado como hash. O que muda e o texto do e-mail e a
-- validade — convite vale dias, redefinicao vale uma hora.
ALTER TABLE "RedefinicaoDeSenha" ADD COLUMN "tipo" TEXT NOT NULL DEFAULT 'REDEFINICAO';
