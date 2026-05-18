/**
 * Service de gestion des commandes via l'API PrestaShop XML.
 */

import {
  getFullResource,
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
  id_cart: string;
  customerName: string;
  total_paid: string;
  conversion_rate?: string;
  stateName: string;
}

const STATE_MAP: { [key: string]: string } = {
  '13': 'Paiement a la livraison',
  '2': 'Paiement accepte',
  '5': 'Livre',
  '6': 'Annule',
};

function getStateName(stateId: string): string {
  return STATE_MAP[stateId] || 'Inconnu';
}

function isPaidLikeState(stateId: string): boolean {
  return stateId === '2' || stateId === '5';
}

function currentSqlDate(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

export async function getAllOrders(): Promise<Order[]> {
  try {
    const [orderRows, customerRows] = await Promise.all([
      getFullResource('orders', '[id,reference,date_add,current_state,id_customer,id_cart,total_paid,conversion_rate]'),
      getFullResource('customers', '[id,firstname,lastname]').catch(() => []),
    ]);
    const customers = new Map(
      (customerRows as any[]).map((customer) => [
        customer.id,
        `${customer.firstname || ''} ${customer.lastname || ''}`.trim() || `Client #${customer.id}`,
      ])
    );
    const orders: Order[] = [];

    for (const orderData of orderRows as any[]) {
      let orderId = '';
      try {
        orderId = orderData.id || '';
        const idCustomer = orderData.id_customer || '';
        let customerName = customers.get(idCustomer) || (idCustomer ? `Client #${idCustomer}` : 'Inconnu');

        if (!customerName && idCustomer) {
          try {
            const customerData = (await getOne('customers', idCustomer)) as any;
            customerName = `${customerData.firstname || ''} ${customerData.lastname || ''}`.trim() || 'Inconnu';
          } catch {
            customerName = `Client #${idCustomer}`;
          }
        }

        const currentState = orderData.current_state || '8';
        orders.push({
          id: orderId,
          reference: orderData.reference || '',
          date_add: orderData.date_add || '',
          current_state: currentState,
          id_customer: idCustomer,
          id_cart: orderData.id_cart || '',
          customerName,
          total_paid: orderData.total_paid || '0',
          conversion_rate: orderData.conversion_rate || '1',
          stateName: getStateName(currentState),
        });
      } catch (itemError) {
        console.warn(`Erreur traitement commande ${orderId}:`, itemError);
      }
    }

    console.log(`${orders.length} commandes chargees`);
    return orders;
  } catch (error) {
    console.error('Erreur getAllOrders:', error);
    throw error;
  }
}

export async function updateOrderState(orderId: string, newStateId: string): Promise<boolean> {
  try {
    if (!STATE_MAP[newStateId]) {
      console.error(`Etat invalide: ${newStateId}`);
      return false;
    }

    const now = currentSqlDate();
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

        setNode('id_order_state', newStateId);
        setNode('current_state', newStateId);
        setNode('valid', isPaidLikeState(newStateId) ? '1' : '0');
        setNode('date_upd', now);

        Array.from(orderElem!.children).forEach((child: any) => {
          orderData[child.tagName] = child.textContent || '';
        });

        xmlOrderToPut = new XMLSerializer().serializeToString(xmlDoc);
      } catch (xmlErr) {
        console.warn('Erreur parsing order XML, fallback to getOne()', xmlErr);
      }
    }

    if (!xmlOrderToPut) {
      orderData = (await getOne('orders', orderId)) as any;
      xmlOrderToPut = `<?xml version="1.0" encoding="UTF-8"?>
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
    <valid>${isPaidLikeState(newStateId) ? '1' : '0'}</valid>
    <date_add>${orderData.date_add || ''}</date_add>
    <date_upd>${now}</date_upd>
    <payment>${orderData.payment || '-'}</payment>
  </order>
</prestashop>`;
    }

    const updateSuccess = await putXML('orders', orderId, xmlOrderToPut);
    if (!updateSuccess) return false;

    if (isPaidLikeState(newStateId)) {
      try {
        const xmlOrderPayment = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_payment>
    <order_reference>${orderData.reference || ''}</order_reference>
    <id_currency>${orderData.id_currency || '1'}</id_currency>
    <amount>${orderData.total_paid || '0'}</amount>
    <payment><![CDATA[${orderData.payment || 'Manual'}]]></payment>
    <date_add>${now}</date_add>
  </order_payment>
</prestashop>`;

        const paymentResult: any = await postXML('order_payments', xmlOrderPayment);
        if (!paymentResult || !paymentResult.success) {
          console.warn(`Avertissement: order_payment non cree pour commande ${orderId}`);
        }
      } catch (payErr) {
        console.warn(`Erreur creation order_payment pour ${orderId}:`, payErr);
      }
    }

    const xmlOrderHistory = `<?xml version="1.0" encoding="UTF-8"?>
<prestashop>
  <order_history>
    <id_order>${orderId}</id_order>
    <id_order_state>${newStateId}</id_order_state>
    <id_employee>1</id_employee>
    <date_add>${now}</date_add>
  </order_history>
</prestashop>`;

    const historyResult: any = await postXML('order_histories', xmlOrderHistory);
    if (!historyResult.success) {
      console.warn(`Avertissement: Historique non cree pour commande ${orderId}`);
    }

    console.log(`Commande ${orderId} mise a jour vers etat ${newStateId}`);
    return true;
  } catch (error) {
    console.error(`Erreur updateOrderState(${orderId}, ${newStateId}):`, error);
    return false;
  }
}
