function managedUsersFromEnv(env = process.env) {
  return [{ nombre:env.PSYCHOLOGIST_NAME||'Luz Adriana', apellido:env.PSYCHOLOGIST_LASTNAME||'Psicóloga', email:(env.PSYCHOLOGIST_EMAIL||'').trim().toLowerCase(), password:env.PSYCHOLOGIST_PASSWORD||'', rol:'psicologa' },
    { nombre:env.MAINTENANCE_NAME||'Soporte', apellido:env.MAINTENANCE_LASTNAME||'Técnico', email:(env.MAINTENANCE_EMAIL||'').trim().toLowerCase(), password:env.MAINTENANCE_PASSWORD||'', rol:'superadmin' }];
}
function validateManagedUser(user) {
  if(!user.email||!user.password) throw new Error(`Credenciales incompletas para el rol ${user.rol}`);
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) throw new Error(`Correo inválido para el rol ${user.rol}`);
  if(user.password.length<10) throw new Error(`La contraseña de ${user.rol} debe tener al menos 10 caracteres`);
  if(!['psicologa','superadmin'].includes(user.rol)) throw new Error('Rol gestionado inválido');
  return true;
}
module.exports={managedUsersFromEnv,validateManagedUser};
