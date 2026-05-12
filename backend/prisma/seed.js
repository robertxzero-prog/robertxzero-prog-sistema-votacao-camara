const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed...');

  const senhaAdmin = await bcrypt.hash('123456', 10);

  const admin = await prisma.usuarios.upsert({
    where: {
      email: 'admin@camara.local',
    },
    update: {},
    create: {
      nome: 'Robert Adam',
      email: 'admin@camara.local',
      senha_hash: senhaAdmin,
      role: 'ADMIN',
      ativo: true,
    },
  });

  console.log('Admin criado:', admin.email);

  for (let numero = 1; numero <= 9; numero++) {
    await prisma.cadeiras.upsert({
      where: {
        numero,
      },
      update: {},
      create: {
        numero,
        linha: Math.ceil(numero / 3),
        coluna: ((numero - 1) % 3) + 1,
        descricao: `Cadeira ${numero}`,
        ativa: true,
      },
    });
  }

  console.log('9 cadeiras criadas.');

  const vereadores = [
    ['Aldemir Pires', 'vereador1@camara.local', 'PSD', 1],
    ['Vereador 2', 'vereador2@camara.local', 'MDB', 2],
    ['Vereador 3', 'vereador3@camara.local', 'PT', 3],
    ['Vereador 4', 'vereador4@camara.local', 'PSD', 4],
    ['Vereador 5', 'vereador5@camara.local', 'PL', 5],
    ['Vereador 6', 'vereador6@camara.local', 'UNIÃO', 6],
    ['Vereador 7', 'vereador7@camara.local', 'PP', 7],
    ['Vereador 8', 'vereador8@camara.local', 'REPUBLICANOS', 8],
    ['Vereador 9', 'vereador9@camara.local', 'PSB', 9],
  ];

  for (const [nome, email, partido, cadeiraNumero] of vereadores) {
    const senha = await bcrypt.hash('123456', 10);

    const usuario = await prisma.usuarios.upsert({
      where: {
        email,
      },
      update: {},
      create: {
        nome,
        email,
        senha_hash: senha,
        role: 'VEREADOR',
        ativo: true,
      },
    });

    const cadeira = await prisma.cadeiras.findUnique({
      where: {
        numero: cadeiraNumero,
      },
    });

    if (!cadeira) {
      throw new Error(`Cadeira ${cadeiraNumero} não encontrada.`);
    }

    await prisma.vereadores.upsert({
      where: {
        usuario_id: usuario.id,
      },
      update: {},
      create: {
        usuario_id: usuario.id,
        cadeira_id: cadeira.id,
        partido,
      },
    });
  }

  console.log('Vereadores criados.');
  console.log('Seed finalizado.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });