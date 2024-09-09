import requests
import ipaddress

def fetch_cloudfront_ips():
    url = "https://ip-ranges.amazonaws.com/ip-ranges.json"
    response = requests.get(url)
    response.raise_for_status()
    data = response.json()
    cloudfront_ips = [prefix['ip_prefix'] for prefix in data['prefixes'] if prefix['service'] == 'CLOUDFRONT']
    return cloudfront_ips

def merge_ip_ranges(ip_ranges):
    networks = [ipaddress.ip_network(ip_range) for ip_range in ip_ranges]
    merged = []
    while networks:
        network = networks.pop(0)
        merged_networks = [network]
        for other_network in networks:
            if network.supernet_of(other_network):
                merged_networks.append(other_network)
            elif other_network.supernet_of(network):
                merged_networks = [other_network]
                break
        else:
            merged.extend(ipaddress.collapse_addresses(merged_networks))
            networks = [net for net in networks if net not in merged_networks]
    
    return sorted(merged, key=lambda net: (net.network_address, net.prefixlen))

def main():
    # Fetch CloudFront IP ranges
    cloudfront_ips = fetch_cloudfront_ips()

    # Merge the IP ranges
    merged_cidrs = merge_ip_ranges(cloudfront_ips)

    # Print the result
    for cidr in merged_cidrs:
        print(cidr)

if __name__ == "__main__":
    main()

