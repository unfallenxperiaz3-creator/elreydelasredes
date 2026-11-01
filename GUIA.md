# El Rey de las Redes · Guía de puesta en marcha

La web se aloja gratis en **Netlify** (su plan gratuito permite cobrar), con la base de datos en **Supabase** y los pagos en **Stripe**.

> **Nunca pegues tus claves secretas en un chat, en un mensaje ni en el código.** Solo van en Netlify, en *Environment variables*.

---

## 1. Base de datos (Supabase)

1. Supabase → **SQL Editor** → **New query** → pega todo `supabase/schema.sql` → **Run** (debe salir *Success*).
2. **Project Settings → API Keys**: apunta en privado la **Project URL** (`https://xxxx.supabase.co`) y una **Secret key** (`sb_secret_…`). No uses la *anon* ni la *publishable*.

## 2. Publicar la web (Netlify)

1. Entra en netlify.com con tu cuenta de GitHub → **Add new project → Import an existing project → GitHub** → elige `elreydelasredes`.
2. No cambies nada de la configuración de compilación (ya está en `netlify.toml`) y pulsa **Deploy**.
3. **Project configuration → Environment variables → Add a variable** y añade:

| Key | Value |
|---|---|
| `SUPABASE_URL` | La Project URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | La Secret key de Supabase (`sb_secret_…`) |
| `STRIPE_SECRET_KEY` | `sk_test_…` para pruebas; `sk_live_…` para cobrar de verdad |
| `STRIPE_WEBHOOK_SECRET` | El `whsec_…` del destino de eventos de Stripe |
| `ADMIN_PASSWORD` | Contraseña inventada para el panel `/admin` |
| `SITE_URL` | `https://www.elreydelasredes.es` |
| `LEGAL_NAME` | Tu nombre o nombre comercial |
| `LEGAL_NIF` | Tu NIF |
| `LEGAL_EMAIL` | Tu email de contacto |

4. **Deploys → Trigger deploy → Deploy site** para que se apliquen. (Siempre que cambies una variable, vuelve a desplegar.)

## 3. Dominio

1. Netlify → **Domain management → Add a domain** → `www.elreydelasredes.es` (y acepta añadir también `elreydelasredes.es`).
2. Netlify te dirá qué poner en tu proveedor (Nominalia → *Editar zona DNS*). Normalmente:
   - Registro **A** de `elreydelasredes.es` → la IP que indique Netlify.
   - Registro **CNAME** de `www` → `TU-SITIO.netlify.app`
3. No toques los registros del correo (MX, TXT, SRV, `autoconfig`, `pop`, `_domainkey`…).
4. Netlify activa el certificado HTTPS solo cuando los DNS apuntan bien (puede tardar un rato).

## 4. Avisos de pago (Stripe)

1. Stripe → **Webhooks / Destinos de eventos → Añade un destino** → *Tu cuenta* → eventos:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `invoice.paid`, `customer.subscription.deleted` → *Punto de conexión de webhook*.
2. URL: `https://www.elreydelasredes.es/api/webhook` (con www: Stripe no sigue redirecciones).
3. Copia su **clave secreta de firma** (`whsec_…`) en `STRIPE_WEBHOOK_SECRET` y vuelve a desplegar.

En **modo de prueba** y en **modo real** son destinos distintos, cada uno con su `whsec_…`.

## 5. Prueba

1. En la web, **Soy creador: conseguir mi puesto** → paga con la tarjeta de prueba `4242 4242 4242 4242` (cualquier fecha futura y CVC).
2. Debes aparecer en el trono en unos segundos. En `/admin` (con tu `ADMIN_PASSWORD`) verás el pago.
3. Si no aparece: Stripe → tu destino → *Entregas de eventos* (en rojo verás el motivo). En Netlify → **Logs → Functions** verás los errores del servidor.

## 6. Cobrar dinero real

1. Stripe sin modo de prueba: copia la `sk_live_…` en `STRIPE_SECRET_KEY`.
2. Crea el destino de eventos en modo real (paso 4) y pon su `whsec_…` en `STRIPE_WEBHOOK_SECRET`.
3. Vuelve a desplegar y haz un pago real pequeño para comprobarlo.
4. Borra los datos de prueba: Supabase → SQL Editor →
   `truncate payments, subscriptions, duels, king_log, hall, creators restart identity cascade;`

## 7. Opcional: emails de «te han superado»

Crea una cuenta en resend.com, verifica tu dominio y añade `RESEND_API_KEY` y `MAIL_FROM` (por ejemplo `El Rey de las Redes <avisos@elreydelasredes.es>`). Vuelve a desplegar.

---

## Día a día

- **Verificaciones**: `/admin` → abre el perfil, comprueba el código `REY-XXXX` en su bio → **Aprobar**.
- **Contenido inapropiado**: `/admin` → **Ocultar** o **Quitar foto**.
- **Alguien perdió el acceso** (cambió de móvil): comprueba que es el dueño real → **Nuevo acceso** en `/admin` → mándale el código; lo pega en la web en *Recuperar acceso de creador*.
- **Temporadas**: automáticas. Cada lunes a las 00:00 (Madrid) empieza un ranking nuevo y de madrugada el rey anterior entra en el salón de reyes.
- **Dinero**: Stripe te lo transfiere al banco automáticamente. Las facturas, con un programa compatible con Verifactu.
- **Uso del plan gratuito**: Netlify tiene un límite mensual de uso en su plan gratuito. Revisa de vez en cuando *Usage* en Netlify; si la web crece mucho, ese será el momento de valorar un plan de pago.

## Estructura del proyecto

```
public/index.html      La web
public/admin.html      Panel de administrador
api/                   Lógica de cada endpoint (pagos, ranking, duelos, admin)
netlify/functions/     Puente para Netlify (reutiliza api/)
lib/                   Lógica compartida
supabase/schema.sql    Tablas de la base de datos
netlify.toml           Rutas (/api, /admin, /@usuario) para Netlify
vercel.json            Configuración alternativa si algún día usas Vercel
```
