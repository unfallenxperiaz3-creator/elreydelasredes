# El Rey de las Redes · Guía de puesta en marcha

Sigue los pasos en orden. Todo se hace desde el navegador; no hace falta instalar nada.

> **Nunca pegues tus claves secretas en un chat, en un mensaje ni en el código.** Solo van en Vercel, en *Environment Variables*.

---

## 1. Base de datos (Supabase)

1. Entra en tu proyecto de Supabase → **SQL Editor** → **New query**.
2. Pega todo el contenido de `supabase/schema.sql` y pulsa **Run**. Debe salir *Success*.
3. Ve a **Project Settings → API Keys** (o **Data API**) y apunta en un sitio privado:
   - **Project URL** (empieza por `https://` y acaba en `.supabase.co`).
   - La clave **secreta**: se llama `service_role` o *secret key* (empieza por `eyJ…` o por `sb_secret_…`). **No es la clave anon/publishable.**

## 2. Claves de Stripe (en modo de prueba)

1. En Stripe activa **Test mode**.
2. **Developers → API keys** → copia la **Secret key** (empieza por `sk_test_…`).

## 3. Publicar la web (Vercel)

1. En Vercel: **Add New… → Project** → importa el repositorio `elreydelasredes`.
2. *Framework Preset*: **Other**. No toques nada más.
3. Abre **Environment Variables** y añade estas, una por una:

| Nombre | Valor |
|---|---|
| `SUPABASE_URL` | La Project URL de Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | La clave secreta de Supabase |
| `STRIPE_SECRET_KEY` | `sk_test_…` de Stripe |
| `STRIPE_WEBHOOK_SECRET` | De momento pon `pendiente` (lo cambias en el paso 4) |
| `ADMIN_PASSWORD` | Una contraseña larga inventada por ti para el panel de administrador |
| `CRON_SECRET` | Cualquier texto largo y aleatorio (por ejemplo 40 letras y números) |
| `LEGAL_NAME` | Tu nombre o nombre comercial (para el aviso legal) |
| `LEGAL_NIF` | Tu NIF |
| `LEGAL_EMAIL` | Tu email de contacto |

4. Pulsa **Deploy**. Al terminar tendrás una dirección tipo `https://elreydelasredes.vercel.app`.

## 4. Avisos de pago (webhook de Stripe)

Es lo que hace que el ranking se actualice solo cuando alguien paga.

1. En Stripe (modo de prueba): **Developers → Webhooks → Add endpoint** (o *Add destination*).
2. **URL**: `https://TU-DIRECCION.vercel.app/api/webhook`
3. **Eventos** (marca estos 4):
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
   - `invoice.paid`
   - `customer.subscription.deleted`
4. Guarda y copia el **Signing secret** (empieza por `whsec_…`).
5. En Vercel → tu proyecto → **Settings → Environment Variables** → cambia `STRIPE_WEBHOOK_SECRET` por ese `whsec_…`.
6. **Deployments** → en el último, menú **⋯ → Redeploy**. (Siempre que cambies una variable hay que redesplegar.)

## 5. Prueba completa

1. Abre tu web y pulsa **Soy creador: conseguir mi puesto**.
2. Rellena los datos y paga con la tarjeta de prueba de Stripe:
   - Número `4242 4242 4242 4242`, cualquier fecha futura, cualquier CVC y cualquier código postal.
3. Al volver a la web debes aparecer en el trono en unos segundos.
4. Prueba también **Apoyar** (una vez y cada mes) desde otro navegador o en modo incógnito.
5. Entra en `https://TU-DIRECCION.vercel.app/admin` con tu `ADMIN_PASSWORD`: verás los pagos y podrás aprobar verificaciones.

Si algo falla: en Stripe → Webhooks → tu endpoint verás si los avisos llegan (en verde) o fallan (en rojo, con el motivo). En Vercel → **Logs** verás los errores del servidor.

## 6. Tu dominio

1. Vercel → proyecto → **Settings → Domains** → añade `elreydelasredes.com` y sigue las instrucciones de DNS que te da (se configuran en la web donde compraste el dominio).
2. Cuando funcione, añade la variable `SITE_URL` = `https://elreydelasredes.com` y redespliega.
3. En Stripe, edita el webhook y cambia la URL a `https://elreydelasredes.com/api/webhook`.

## 7. Cobrar dinero real

Cuando todo funcione en pruebas:

1. **Pasa Vercel al plan Pro.** El plan gratuito (Hobby) solo permite uso personal y no comercial; una web que cobra necesita el plan Pro (unos 20 $/mes).
2. En Stripe desactiva **Test mode**.
3. Copia la **Secret key real** (`sk_live_…`) y cámbiala en Vercel (`STRIPE_SECRET_KEY`).
4. Crea **otro webhook** en modo real con la misma URL y los mismos 4 eventos, y pon su nuevo `whsec_…` en `STRIPE_WEBHOOK_SECRET`.
5. Redespliega.

Los pagos de prueba no aparecen en modo real: el ranking real empieza vacío.

## 8. Opcional: emails de «te han superado»

1. Crea una cuenta en resend.com y verifica tu dominio.
2. Añade en Vercel `RESEND_API_KEY` (tu clave de Resend) y `MAIL_FROM` (por ejemplo `El Rey de las Redes <avisos@elreydelasredes.com>`).
3. Redespliega. Desde ese momento, los creadores que dejen su email recibirán un aviso cuando alguien les adelante.

---

## Día a día

- **Verificaciones**: entra en `/admin`, abre el perfil del creador, comprueba que el código `REY-XXXX` está en su bio y pulsa **Aprobar**.
- **Contenido inapropiado**: en `/admin` puedes **Ocultar** un creador o **Quitar foto**.
- **Alguien perdió el acceso a su cuenta** (cambió de móvil): comprueba que es el dueño real (por ejemplo, que te escriba desde esa cuenta), pulsa **Nuevo acceso** en `/admin` y mándale el código. Lo pega en la web en *Recuperar acceso de creador* (abajo del todo).
- **Cierre de temporada**: automático. Cada lunes a las 00:00 (hora de Madrid) empieza un ranking nuevo, y durante la madrugada el rey de la semana anterior entra en el salón de reyes.
- **Dinero**: Stripe te lo transfiere al banco automáticamente. Las facturas tienes que hacerlas con un programa de facturación compatible con Verifactu; pregunta a tu gestor.

## Estructura del proyecto

```
public/index.html     La web
public/admin.html     Panel de administrador
api/                  Servidor (pagos, ranking, duelos, administración)
lib/                  Lógica compartida
supabase/schema.sql   Tablas de la base de datos
vercel.json           Rutas (/@usuario, /admin) y tarea diaria de cierre de temporada
```
