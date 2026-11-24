# Connect a domain

During initial setup, choose the address of your admin dashboard before you register the owner passkey. Select **Use this hostname** to keep the original `workers.dev` address, or choose a custom hostname in an active Cloudflare DNS zone in the same account as the Worker.

## Create a scoped Cloudflare API token

In Cloudflare, create a custom API token with **Account → Workers Scripts → Edit**, **Zone → Zone → Read**, **Zone → DNS → Read**, and **Zone → Workers Routes → Edit**. Limit the account and zone resources to the Worker account and the target DNS zone. Paste the token in Linkrovia's connection screen. Linkrovia uses it for the submitted operation and discards it afterward. [Create an API token](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) · [Worker role permissions](https://developers.cloudflare.com/workers/authorization/workers/)

Choose a hostname that is available. Linkrovia checks for conflicts and blocks changes that would overwrite an existing origin or conflicting DNS record. A route, a DNS delegation, or an exact-host record such as A, AAAA, or CNAME can block assignment. MX and TXT records can coexist with the Worker Custom Domain. Cloudflare provisions the Custom Domain's DNS and TLS. Leave its address records for Cloudflare to create. [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)

If another provider manages DNS, you can use `workers.dev` or move the zone to Cloudflare. Review the effect on existing services before moving DNS. [Move an existing domain to Cloudflare](https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/)

## Connect your management hostname during setup

1. Enter the custom hostname and scoped API token. Confirm the hostname and choose **Connect hostname**.
2. Choose **Open setup on your custom hostname**, then enter the setup token again on that hostname. Wait and try again if Cloudflare is still preparing HTTPS. If the connection result could not be confirmed, wait a moment and retry the same hostname in setup so Linkrovia can check the existing mapping. You can also continue setup on `workers.dev`.
3. Register your owner passkey on the address you selected. Use that address to sign in.

## Add a short-link hostname after setup

1. As the owner, open **Domains → Add a domain**, enter the hostname, and open its connection screen.
2. In **Connect automatically**, paste the scoped token and choose **Check access**. Review the hostname, confirm the change, and choose **Connect hostname**. If the screen reports a conflict, review the hostname in Cloudflare. Use a free hostname or resolve the conflict and retry. If Cloudflare cannot confirm an assignment, review the mapping before retrying. If the hostname already reaches this Worker, use **Check connection** to resume.
3. Choose **Check connection**. Linkrovia checks public DNS and verifies over HTTPS that the hostname reaches this installation. Wait and retry if DNS or the certificate is still being prepared. An **Active** hostname can serve short links.

Choose **Connect manually** to use the Cloudflare dashboard instead. For a hostname you already assigned to the Worker, open its Linkrovia connection screen and choose **Check connection**. [Add a Custom Domain in Cloudflare](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/#set-up-a-custom-domain-in-the-dashboard)

## Enable admin access on an existing custom hostname

If the original sign-in host is `workers.dev`, the owner can open a verified custom hostname's connection screen and choose **Enable management access**. One custom hostname can have this access at a time. Sign-in from that hostname takes you to the original host to use your existing passkey, then returns you to the custom dashboard. Keep the original sign-in host reachable.

When restoring configuration to a new installation, choose its management hostname during setup. Review management access after the restore. The new installation manages its own sign-in hosts and passkeys. [Backup and restore](backup.md)

## Pause or remove a hostname

Choose **Disconnect** to pause short links while keeping the Cloudflare assignment. To resume, use **Check connection**. Linkrovia preserves your saved links and settings.

To release an eligible assignment created by Linkrovia, select **Remove from Cloudflare**, enter a scoped token, confirm the hostname, and choose **Remove hostname**. For an assignment created in Cloudflare, remove it from the Worker's **Settings → Domains & Routes**. [Cloudflare Custom Domains](https://developers.cloudflare.com/workers/configuration/routing/custom-domains/)
