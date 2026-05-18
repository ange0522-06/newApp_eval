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
  total_paid_tax_excl?: string;
  conversion_rate?: string;
  stateName: string;
  order_rows?: Array<{ product_id: string, product_quantity: string, unit_price_tax_excl: string }>;
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
      getFullResource('orders', '[id,reference,date_add,current_state,id_customer,id_cart,total_paid,total_paid_tax_excl,conversion_rate]'),
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
          total_paid_tax_excl: orderData.total_paid_tax_excl || '0',
          conversion_rate: orderData.conversion_rate || '1',
          stateName: getStateName(currentState),
          order_rows: [], // will be fetched via order_details instead if needed
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

    const response = await fetch('http://localhost/e-commerce/eval/modules/my_orde_state/shiporder.php', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id_order: orderId,
        new_state: newStateId
      })
    });

    const data = await response.json();
    if (response.ok && data.success) {
      console.log(`Commande ${orderId} mise a jour vers etat ${newStateId} via shiporder.php`);
      return true;
    } else {
      console.error(`Erreur depuis shiporder.php:`, data.error);
      return false;
    }
  } catch (error) {
    console.error(`Erreur updateOrderState(${orderId}, ${newStateId}):`, error);
    return false;
  }
}
