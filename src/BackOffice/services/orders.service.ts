/**
 * Service de gestion des commandes
 * Récupère et modifie les commandes via l'API PrestaShop XML
 */

import {
  getAllIds,
  getOne,
  getOneXml,
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
  conversion_rate?: string;
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
        const conversion_rate = orderData.conversion_rate || '1';

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
          conversion_rate,
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
    // Vérifier que le nouvel état est valide
    if (!STATE_MAP[newStateId]) {
      console.error(`État invalide: ${newStateId}`);
      return false;
    }

    // Récupérer la commande actuelle (XML complet si possible pour éviter d'écraser les montants)
    const orderXmlText = await getOneXml('orders', orderId).catch(() => null);
    let orderData: any = {};
    let xmlOrderToPut = '';

    if (orderXmlText) {
      try {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(orderXmlText, 'text/xml');
        const orderElem = xmlDoc.querySelector('order') || xmlDoc.documentElement.firstElementChild;
        if (!orderElem) throw new Error('order element not found in XML');

        function setNode(tagName: string, value: string) {
          let node = orderElem!.querySelector(tagName);
          if (node) node.textContent = value;
          else {
            const newNode = xmlDoc.createElement(tagName);
            newNode.textContent = value;
            orderElem!.appendChild(newNode);
          }
        }

        // Mettre à jour uniquement les champs d'état / valid / date_upd
        setNode('id_order_state', newStateId);
        setNode('current_state', newStateId);
        setNode('valid', newStateId === '2' ? '1' : '0');
        setNode('date_upd', new Date().toISOString().replace('T', ' ').slice(0, 19));

        // Conserver les valeurs existantes pour orderData utilisées plus loin
        Array.from(orderElem!.children).forEach((child: any) => {
          orderData[child.tagName] = child.textContent || '';
        });

        const serializer = new XMLSerializer();
        xmlOrderToPut = serializer.serializeToString(xmlDoc);
      } catch (xmlErr) {
        console.warn('Erreur parsing order XML, fallback to getOne()', xmlErr);
      }
    }

    // Si on n'a pas pu obtenir le XML complet, récupérer les données parsées et construire un XML minimal
    if (!xmlOrderToPut) {
      orderData = (await getOne('orders', orderId)) as any;
      xmlOrderToPut = `<?xml version="1.0" encoding="UTF-8"?>\n<prestashop>\n  <order>\n    <id>${orderId}</id>\n    <id_customer>${orderData.id_customer || ''}</id_customer>\n    <id_cart>${orderData.id_cart || ''}</id_cart>\n    <id_address_delivery>${orderData.id_address_delivery || ''}</id_address_delivery>\n    <id_address_invoice>${orderData.id_address_invoice || ''}</id_address_invoice>\n    <id_shop>${orderData.id_shop || '1'}</id_shop>\n    <id_order_state>${newStateId}</id_order_state>\n    <current_state>${newStateId}</current_state>\n    <id_currency>${orderData.id_currency || '1'}</id_currency>\n    <id_lang>${orderData.id_lang || '1'}</id_lang>\n    <id_carrier>${orderData.id_carrier || ''}</id_carrier>\n    <id_module>${orderData.id_module || ''}</id_module>\n    <module><![CDATA[${orderData.module || orderData.payment || ''}]]></module>\n    <total_paid>${orderData.total_paid || '0'}</total_paid>\n    <conversion_rate>${orderData.conversion_rate || '1'}</conversion_rate>\n    <total_paid_real>${orderData.total_paid_real || orderData.total_paid || '0'}</total_paid_real>\n    <total_paid_tax_excl>${orderData.total_paid_tax_excl || '0'}</total_paid_tax_excl>\n    <total_products>${orderData.total_products || '0'}</total_products>\n    <total_products_wt>${orderData.total_products_wt || '0'}</total_products_wt>\n    <valid>${newStateId === '2' ? '1' : '0'}</valid>\n    <date_add>${orderData.date_add || ''}</date_add>\n    <date_upd>${new Date().toISOString().replace('T', ' ').slice(0, 19)}</date_upd>\n    <payment>${orderData.payment || '-'}</payment>\n  </order>\n</prestashop>`;
    }

    // Mettre à jour la commande
    const updateSuccess = await putXML('orders', orderId, xmlOrderToPut);
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
