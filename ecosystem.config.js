// Configuração do PM2 para rodar o StudyFlow na VPS como serviço persistente
// (reinicia sozinho se cair, sobrevive a reboot com "pm2 save" + "pm2 startup").
// A VPS é compartilhada com o ATCRM (processo "atcrm", porta 3000).
//
// Uso na VPS (detalhes na seção "Deploy na VPS" do README):
//   npm ci
//   npx prisma migrate deploy
//   npm run build
//   pm2 start ecosystem.config.js
//   pm2 save
//
// Deploy de uma atualização:
//   git pull && npm ci && npx prisma migrate deploy && npm run build && pm2 startOrReload ecosystem.config.js && pm2 save
//   (o "pm2 save" é necessário: o dump salvo é o que o "pm2 resurrect" usa após um reboot da VPS;
//    sem ele o processo voltaria sem o TZ, em UTC. Confira com "pm2 show studyflow | grep -i TZ".)
//
// "-H 127.0.0.1": o Node só escuta no localhost; quem fica público é o Nginx.

module.exports = {
  apps: [
    {
      name: "studyflow",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3002 -H 127.0.0.1",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      env: {
        NODE_ENV: "production",
        // As datas de agendamento são calculadas no fuso do servidor; sem o TZ a VPS (UTC) mudaria o dia às 21h.
        TZ: "America/Sao_Paulo",
      },
      max_memory_restart: "500M",
      restart_delay: 3000,
      max_restarts: 10,
      time: true,
    },
  ],
};
