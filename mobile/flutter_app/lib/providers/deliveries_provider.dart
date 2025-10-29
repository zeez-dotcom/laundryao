import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../api/deliveries_api.dart';
import '../models/delivery_summary.dart';

final deliveriesProvider = FutureProvider<List<DeliverySummary>>((ref) async {
  return DeliveriesApi().listCustomerDeliveries();
});

