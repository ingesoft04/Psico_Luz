const bcrypt = require('bcryptjs');
const db = require('../config/database');
const logger = require('../config/logger');
const { managedUsersFromEnv, validateManagedUser } = require('../utils/managedUsers');
const redis = require('../config/redis');
async function upsertManagedUser(user) {
  validateManagedUser(user);
  const hash=await bcrypt.hash(user.password,Number(process.env.BCRYPT_ROUNDS)||12);
  const {rows}=await db.query(`INSERT INTO app.usuarios(nombre,apellido,email,password_hash,rol,activo,email_verificado)
    VALUES($1,$2,$3,$4,$5,true,true) ON CONFLICT(email) DO UPDATE SET nombre=EXCLUDED.nombre,apellido=EXCLUDED.apellido,password_hash=EXCLUDED.password_hash,rol=EXCLUDED.rol,activo=true,email_verificado=true,updated_at=NOW()
    RETURNING id,nombre,apellido,email,rol,activo`,[user.nombre,user.apellido,user.email,hash,user.rol]);await redis.del(`user:${rows[0].id}`);return rows[0];
}
async function bootstrapManagedUsers(){for(const user of managedUsersFromEnv()){if(!user.email||!user.password){logger.warn(`Bootstrap omitido para ${user.rol}: faltan variables`);continue}const saved=await upsertManagedUser(user);logger.info(`Cuenta gestionada disponible: ${saved.email} [${saved.rol}]`)}await db.query(`UPDATE app.usuarios SET activo=false WHERE password_hash LIKE '%PLACEHOLDER%'`)}
module.exports={upsertManagedUser,bootstrapManagedUsers};
