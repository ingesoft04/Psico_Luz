# Seguridad

## Reporte responsable

No publique vulnerabilidades, credenciales ni datos clínicos en issues. Repórtelos de forma privada al propietario del repositorio mediante la opción **Report a vulnerability** de GitHub o por un canal privado previamente acordado.

## Reglas de despliegue

- Cree `.env` desde `.env.example` y use secretos únicos generados aleatoriamente.
- La aplicación en producción falla de forma segura si faltan secretos críticos o si detecta valores públicos conocidos.
- Mantenga pgAdmin, Redis Commander y N8N limitados a localhost, VPN o una red administrativa.
- Use HTTPS, firewall, copias cifradas y rotación documentada de credenciales.
- Nunca confirme historias clínicas, PDFs, imágenes, bases de datos, respaldos, archivos `.env` ni claves privadas.

Si una credencial llega a Git, debe revocarse y rotarse. Borrarla en un commit posterior no elimina su exposición histórica.
