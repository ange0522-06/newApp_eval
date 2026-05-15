/**
 * Service de gestion des commandes
 * Récupère et modifie les commandes via l'API PrestaShop XML
 */

import {
  getAllIds,
  getOne,
  putXML,
  postXML,
} from '../../shared/services/prestashop.service.js';

export interface Order {
  id: string;
  reference: string;
  date_add: string;
  current_state: string;
  id_customer: string;
  customerName: string;
  total_paid: string;
  stateName: string;
}

const STATE_MAP: { [key: string]: string } = {
  '2': 'Paiement effectué',
  '6': 'Annulé'
};

/**
 * Mappe l'ID d'état vers son nom lisible
 */
function getStateName(stateId: string): string {
  return STATE_MAP[stateId] || 'Inconnu';
}

/**
 * Récupère toutes les commandes avec détails clients
 */
export async function getAllOrders(): Promise<Order[]> {
  try {
    const orderIds = await getAllIds('orders');
    const orders: Order[] = [];

    for (const orderId of orderIds) {
      try {
        // Récupérer les données de la commande
        const orderData = (await getOne('orders', orderId)) as any;

        const reference = orderData.reference || '';
        const date_add = orderData.date_add || '';
        const current_state = orderData.current_state || '8';
        const id_customer = orderData.id_customer || '';
        const total_paid = orderData.total_paid || '0';

        // Récupérer les données du client
        let customerName = 'Inconnu';
        if (id_customer) {
          try {
            const customerData = (await getOne('customers', id_customer)) as any;
            const firstname = customerData.firstname || '';
            const lastname = customerData.lastname || '';
            customerName = `${firstname} ${lastname}`.trim() || 'Inconnu';
          } catch (customerError) {
            console.warn(`Erreur récupération client ${id_customer}:`, customerError);
            customerName = `Client #${id_customer}`;
          }
        }

        orders.push({
          id: orderId,
          reference,
          date_add,
          current_state,
          id_customer,
          customerName,
          total_paid,
          stateName: getStateName(current_state),
        });
      } catch (itemError) {
        console.warn(`Erreur traitement commande ${orderId}:`, itemError);
      }
    }

    console.log(`✓ ${orders.length} commandes chargées`);
    return orders;
  } catch (error) {
    console.error('Erreur getAllOrders:', error);
    throw error;
  }
}

/**
 * Modifie l'état d'une commande
 * Met à jour current_state et crée un historique
 */
export async function updateOrderState(
  orderId: string,
  newStateId: string
): Promise<boolean> {
  try {
    // Récupérer la commande actuelle
    const orderData = (await getOne('orders', orderId)) as any;

    // Vérifier que le nouvel état est valide
    if (!STATE_MAP[newStateId]) {
      console.error(`État invalide: ${newStateId}`);
      return false;
    }

    // Construire le XML modifié avec l'état mis à jour
    const xmlOrder = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order>
    <id>${orderId}</id>
    <id_customer>${orderData.id_customer || ''}</id_customer>
    <id_cart>${orderData.id_cart || ''}</id_cart>
    <id_address_delivery>${orderData.id_address_delivery || ''}</id_address_delivery>
    <id_address_invoice>${orderData.id_address_invoice || ''}</id_address_invoice>
    <id_shop>${orderData.id_shop || '1'}</id_shop>
    <id_order_state>${newStateId}</id_order_state>
    <current_state>${newStateId}</current_state>
    <id_currency>${orderData.id_currency || '1'}</id_currency>
    <id_lang>${orderData.id_lang || '1'}</id_lang>
    <id_carrier>${orderData.id_carrier || ''}</id_carrier>
    <id_module>${orderData.id_module || ''}</id_module>
    <module><![CDATA[${orderData.module || orderData.payment || ''}]]></module>
      <total_paid>${orderData.total_paid || '0'}</total_paid>
      <conversion_rate>${orderData.conversion_rate || '1'}</conversion_rate>
      <total_paid_real>${orderData.total_paid_real || orderData.total_paid || '0'}</total_paid_real>
    <total_paid_tax_excl>${orderData.total_paid_tax_excl || '0'}</total_paid_tax_excl>
    <total_products>${orderData.total_products || '0'}</total_products>
    <total_products_wt>${orderData.total_products_wt || '0'}</total_products_wt>
    <valid>${newStateId === '2' ? '1' : '0'}</valid>
    <date_add>${orderData.date_add || ''}</date_add>
    <date_upd>${new Date().toISOString().replace('T', ' ').slice(0, 19)}</date_upd>
    <payment>${orderData.payment || '-'}</payment>
  </order>
</prestashop>`;

    // Mettre à jour la commande
    const updateSuccess = await putXML('orders', orderId, xmlOrder);
    if (!updateSuccess) {
      console.error(`Erreur PUT order ${orderId}`);
      return false;
    }

    // Si la commande est marquée payée, créer aussi la trace de paiement
    if (newStateId === '2') {
      try {
        const xmlOrderPayment = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_payment>
    <order_reference>${orderData.reference || ''}</order_reference>
    <id_currency>${orderData.id_currency || '1'}</id_currency>
    <amount>${orderData.total_paid || '0'}</amount>
    <payment><![CDATA[${orderData.payment || 'Manual'}]]></payment>
    <date_add>${new Date().toISOString().replace('T', ' ').slice(0, 19)}</date_add>
  </order_payment>
</prestashop>`;

        const paymentResult: any = await postXML('order_payments', xmlOrderPayment);
        if (!paymentResult || !paymentResult.success) {
          console.warn(`Avertissement: order_payment non créé pour commande ${orderId}`);
        }
      } catch (payErr) {
        console.warn(`Erreur création order_payment pour ${orderId}:`, payErr);
      }
    }

    // Créer un historique de changement d'état
    const xmlOrderHistory = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_history>
    <id_order>${orderId}</id_order>
    <id_order_state>${newStateId}</id_order_state>
    <id_employee>1</id_employee>
    <date_add>${new Date().toISOString().replace('T', ' ').slice(0, 19)}</date_add>
  </order_history>
</prestashop>`;

    const historyResult: any = await postXML('order_histories', xmlOrderHistory);
    if (!historyResult.success) {
      console.warn(`Avertissement: Historique non créé pour commande ${orderId}`);
      // Ne pas échouer si l'historique ne peut pas être créé
    }

    console.log(`✓ Commande ${orderId} mise à jour vers état ${newStateId}`);
    return true;
  } catch (error) {
    console.error(`Erreur updateOrderState(${orderId}, ${newStateId}):`, error);
    return false;
  }
}
